import { prisma } from "../../db/prismaClient";
import { Response, Request } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { parseBigInts } from "./../../services/index.service";
import {
  cancelOrderWithGatewayRefund,
  syncShipmentStatusOnPasarela,
} from "../../services/pasarelaPagos.service";
import {
  getOrderCancellationBlockMessage,
  isOrderWithinCancellationWindow,
} from "../../services/orderCancellationWindow.service";
import axios from "axios";
import {
  sumShipmentCostTotals,
  toMoneyNumber,
} from "../../utils/shipmentCosts";
import { sendLicenseKeyEmail, resolveProductImageUrl } from "../../services/resend.service";

function isDigitalLicenseType(licenseType?: string | null): boolean {
  const value = String(licenseType ?? "").toLowerCase();
  return value === "windows" || value === "antivirus" || value === "office";
}

function isDigitalLicenseSale(params: {
  licenseType?: string | null;
  shippingMethod?: string | null;
}): boolean {
  return (
    String(params.shippingMethod ?? "").toLowerCase() === "digital" ||
    isDigitalLicenseType(params.licenseType)
  );
}

async function markSaleLicenseDeliveredAndMaybeCloseShipment(params: {
  idSale: number;
  idOrder: number;
  authorization: string;
  userId: number;
}): Promise<{ shipmentMarkedEntregado: boolean; idShipment: number | null }> {
  const deliveredAt = new Date();

  const sale = await prisma.sales.update({
    where: { idSale: BigInt(params.idSale) },
    data: {
      licenseDeliveredAt: deliveredAt,
      shipStatus: "entregado",
      statusChangedAt: deliveredAt,
    },
    select: {
      shipmentId: true,
      orderId: true,
    },
  });

  const shipmentId = sale.shipmentId ? Number(sale.shipmentId) : null;
  if (!shipmentId) {
    return { shipmentMarkedEntregado: false, idShipment: null };
  }

  const shipment = await prisma.shipments.findUnique({
    where: { idShipment: BigInt(shipmentId) },
    select: { shipping_method: true, status: true },
  });

  const salesOnShipment = await prisma.sales.findMany({
    where: { shipmentId: BigInt(shipmentId) },
    select: {
      licenseDeliveredAt: true,
      products: { select: { licenseType: true } },
    },
  });

  const shippingMethod = shipment?.shipping_method ?? null;
  const allDigitalSalesDelivered = salesOnShipment.every((row) => {
    const isDigital = isDigitalLicenseSale({
      licenseType: row.products?.licenseType,
      shippingMethod,
    });
    if (!isDigital) return true;
    return row.licenseDeliveredAt != null;
  });

  if (!allDigitalSalesDelivered) {
    return { shipmentMarkedEntregado: false, idShipment: shipmentId };
  }

  await prisma.shipments.update({
    where: { idShipment: BigInt(shipmentId) },
    data: {
      status: "entregado",
      lastUpdated: deliveredAt,
      statusChangedAt: deliveredAt,
    },
  });

  await syncShipmentStatusOnPasarela({
    idShipment: shipmentId,
    status: "entregado",
    idUser: params.userId,
    authorization: params.authorization,
  });

  return { shipmentMarkedEntregado: true, idShipment: shipmentId };
}

function normalizeHistorySearchTerm(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "");
}

function orderMatchesHistorySearch(
  order: {
    idOrder: bigint | number;
    products: ReadonlyArray<{
      name?: string | null | undefined;
      description?: string | null | undefined;
      idProduct?: bigint | number | undefined;
      trackingNumber?: string | null | undefined;
    }>;
  },
  rawTerm: unknown,
): boolean {
  const term = normalizeHistorySearchTerm(rawTerm);
  if (!term) return true;

  const orderId = String(order.idOrder);
  if (orderId.includes(term)) return true;

  const termDigits = term.replace(/\D/g, "");
  if (termDigits && orderId.includes(termDigits)) return true;

  return order.products.some((product) => {
    const searchableValues = [
      product.name,
      product.description,
      product.idProduct,
      product.trackingNumber,
    ];

    return searchableValues.some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(term),
    );
  });
}

import {
  querySales,
  querySalesWithOrder,
  querySalesWithStatus,
} from "./../../query/sales.query";

export const registerSales = async (req: CustomRequestI, res: Response) => {
  try {
    const { dataCart, idOrder, total } = req.body;

    const slcCart = await prisma.carts.findFirst({
      where: {
        userId: Number(req.idUser),
      },
    });

    if (!slcCart) {
      return res
        .status(400)
        .json({ ok: false, message: "Carrito no encontrado" });
    }

    await prisma.sales.createMany({
      data: dataCart.map((product: any) => ({
        userId: Number(req.idUser),
        productId: Number(product.idProduct),
        orderId: Number(idOrder),
        quantity: Number(product.quantity),
        total: total,
        status: "paid",
      })),
    });

    await prisma.cartItems.updateMany({
      where: {
        carId: slcCart.idCart,
        productId: { in: dataCart.map((item: any) => Number(item.idProduct)) },
      },
      data: {
        active: 0,
        quantity: 0,
      },
    });

    const slcSales = await prisma.sales.findMany({
      where: {
        orderId: Number(idOrder),
      },
    });

    if (!slcSales) {
      return res.status(400).json({
        ok: false,
        message: `Ventas no encontradas mediante el idOrder ${idOrder}`,
      });
    }

    for (const sale of slcSales) {
      await prisma.products.update({
        where: {
          idProduct: Number(sale.productId),
          stock: {
            gte: Number(sale.quantity!),
          },
        },
        data: {
          stock: { decrement: Number(sale.quantity) },
        },
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Compra realizada exitosamente",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const getPedidosByUser = async (req: CustomRequestI, res: Response) => {
  try {
    const getAllPedidosByUser: any = await prisma.$queryRawUnsafe(
      querySales({ idUser: Number(req.idUser) }),
    );
    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: getAllPedidosByUser.map((item: any) => {
          const parsedItem: any = {};

          for (const key in item) {
            if (typeof item[key] === "bigint") {
              parsedItem[key] = Number(item[key]); // o .toString() si quieres evitar problemas de overflow
            } else {
              parsedItem[key] = item[key];
            }
          }

          return parsedItem;
        }),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const getSalesByUser = async (req: CustomRequestI, res: Response) => {
  try {
    const { idOrder, page: rawPage, pageSize: rawPageSize } = req.body;

    if (!idOrder) {
      return res
        .status(400)
        .json({ ok: false, message: "Falta mandar el idOrder en el body" });
    }

    const page = Math.max(1, Number(rawPage) || 1);
    const pageSize = Math.min(20, Math.max(1, Number(rawPageSize) || 4));
    const skip = (page - 1) * pageSize;
    const orderId = Number(idOrder);

    const slcAllSalesUser = await prisma.order.findFirst({
      where: {
        idOrder: orderId,
        userId: Number(req.idUser),
      },
      include: {
        users: {
          select: { email: true },
        },
        shipments: {
          include: {
            addresses: true,
          },
        },
      },
    });

    if (!slcAllSalesUser) {
      return res.status(404).json({
        ok: false,
        message: "Orden no encontrada",
      });
    }

    const [totalSales, paginatedSales, salesOverviewRows] = await Promise.all([
      prisma.sales.count({ where: { orderId } }),
      prisma.sales.findMany({
        where: { orderId },
        include: {
          products: true,
        },
        orderBy: { idSale: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.sales.findMany({
        where: { orderId },
        select: {
          idSale: true,
          shipmentId: true,
          productId: true,
          quantity: true,
          products: {
            select: {
              name: true,
              providerId: true,
            },
          },
        },
        orderBy: { idSale: "asc" },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalSales / pageSize));
    const safePage = Math.min(page, totalPages);

    let sales = paginatedSales;
    if (safePage !== page) {
      sales = await prisma.sales.findMany({
        where: { orderId },
        include: { products: true },
        orderBy: { idSale: "asc" },
        skip: (safePage - 1) * pageSize,
        take: pageSize,
      });
    }

    const salesOverview = salesOverviewRows.map((sale) => ({
      idSale: sale.idSale,
      shipmentId: sale.shipmentId,
      productId: sale.productId,
      quantity: sale.quantity,
      name: sale.products?.name?.trim() || "Producto",
      providerId: sale.products?.providerId ?? null,
    }));

    const branchIds = [
      ...new Set(
        slcAllSalesUser.shipments
          .map((shipment) => shipment.storeId)
          .filter((storeId): storeId is number => storeId != null && storeId > 0),
      ),
    ];

    const branches =
      branchIds.length > 0
        ? await prisma.branches.findMany({
          where: {
            idBranche: { in: branchIds.map((id) => BigInt(id)) },
          },
          select: {
            idBranche: true,
            name: true,
            city: true,
          },
        })
        : [];

    const branchById = new Map(
      branches.map((branch) => [Number(branch.idBranche), branch]),
    );

    const { shippingTotal, insuranceTotal } = sumShipmentCostTotals(
      slcAllSalesUser.shipments,
    );

    const { users, ...orderData } = slcAllSalesUser;

    const orderWithBranches = {
      ...orderData,
      customerEmail: users?.email ?? null,
      sales,
      salesOverview,
      salesPagination: {
        page: safePage,
        pageSize,
        totalItems: totalSales,
        totalPages,
      },
      shippingTotal,
      insuranceTotal,
      shipments: slcAllSalesUser.shipments.map((shipment) => ({
        ...shipment,
        shippingCost: toMoneyNumber(shipment.shippingCost),
        insuranceCost: toMoneyNumber(shipment.insuranceCost),
        branch: branchById.get(Number(shipment.storeId)) ?? null,
      })),
    };

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: parseBigInts(orderWithBranches),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const historySalesByUser = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const slcUser = await prisma.users.findFirst({
      where: {
        idUser: Number(req.idUser),
      },
    });

    if (!slcUser) {
      return res.status(400).json({
        ok: false,
        message: "Usuario no encontrado",
      });
    }

    const history: any = await prisma.$queryRawUnsafe(
      querySales({ idUser: req.idUser }),
    );

    const paidHistory = (history || []).filter((item: any) => {
      const saleStatus = String(item.status ?? "");
      return saleStatus === "paid" || saleStatus === "cancelled";
    });

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data:
          paidHistory.length > 0 ? parseBigInts(paidHistory) : [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const filterSales = async (req: CustomRequestI, res: Response) => {
  try {
    const {
      status = "allState",
      startDate = "",
      endDate = "",
      searchProduct = "",
      page = 1,
      limit = 10,
    } = req.body;

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(limit) || 10));

    const orders = await prisma.order.findMany({
      where: {
        userId: Number(req.idUser),
        pay_method: {
          not: "esperando",
        },
        status: {
          in: ["paid", "cancelled", "refunded"],
        },
      },
      orderBy: {
        idOrder: "desc",
      },
      include: {
        shipments: {
          include: {
            addresses: true,
          },
        },
        sales: {
          include: {
            products: {
              select: {
                idProduct: true,
                name: true,
                description: true,
                price: true,
                image_url: true,
                providerId: true,
              },
            },
            shipments: {
              include: {
                addresses: true,
              },
            },
          },
        },
      },
    });

    const parserOrder = orders.map((order) => {
      const { shippingTotal, insuranceTotal } = sumShipmentCostTotals(
        order.shipments,
      );

      return {
        idOrder: order.idOrder,
        totalSales: Number(order.totalAmount ?? 0),
        shippingTotal,
        insuranceTotal,
        createdAt: order?.createdAt,
        updatedAt: order?.updatedAt,
        payment_method: order.pay_method,
        orderStatus: order.status,
        cancelReason: order.cancelReason ?? null,
        idUser: Number(order.userId),
        products: order.sales.map((sale) => {
          const shipment = sale.shipments;

          return {
            idSale: Number(sale.idSale),
            idShipment: shipment?.idShipment ?? sale.shipmentId,
            description: sale.products?.description,
            price: sale?.products?.price,
            idProduct: sale.products.idProduct,
            name: sale.products.name,
            quantity: sale.quantity,
            providerId: sale.products?.providerId,
            statusShip: sale.shipStatus ?? shipment?.status ?? null,
            statusChangedAt: sale.statusChangedAt ?? null,
            shipping_method: shipment?.shipping_method,
            status: sale.status,
            image_url: sale?.products?.image_url,
            trackingNumber: shipment?.trackingNumber,
            shippingCost: toMoneyNumber(shipment?.shippingCost),
            insuranceCost: toMoneyNumber(shipment?.insuranceCost),
            address: shipment?.addresses
              ? {
                idAddress: Number(shipment.addresses.idAddress),
                userId: Number(shipment.addresses.userId),
                street: shipment.addresses.street,
                noExt: shipment.addresses.noExt,
                noInt: shipment.addresses.noInt,
                cologne: shipment.addresses.cologne,
                city: shipment.addresses.city,
                state: shipment.addresses.state,
                country: shipment.addresses.country,
                postalCode: shipment.addresses.postalCode,
                phone1: shipment.addresses.phone1,
                phone2: shipment.addresses.phone2,
                createdAt: shipment.addresses.createdAt,
                updatedAt: shipment.addresses.updatedAt,
                active: shipment.addresses.active,
              }
              : null,
          };
        }),
      };
    });

    const filtered = parserOrder.filter((order) => {
      const statusMatch =
        status && status !== "allState"
          ? order.products.some((product) => product.statusShip === status)
          : true;

      const dateMatch =
        startDate && endDate
          ? (() => {
            const itemDate = new Date(order.createdAt ?? 0);
            const start = new Date(startDate);
            const end = new Date(endDate);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate >= start && itemDate <= end;
          })()
          : true;

      const searchMatch = orderMatchesHistorySearch(order, searchProduct);

      return statusMatch && dateMatch && searchMatch;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(pageNumber, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: paginated.length > 0 ? parseBigInts(paginated) : [],
        pagination: {
          page: safePage,
          limit: pageSize,
          total,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const cancelOrderByUser = async (req: CustomRequestI, res: Response) => {
  try {
    const { idOrder, cancelReason } = req.body;
    const trimmedCancelReason =
      cancelReason != null && String(cancelReason).trim()
        ? String(cancelReason).trim()
        : "";

    if (!idOrder) {
      return res.status(400).json({
        ok: false,
        message: "Falta idOrder",
      });
    }

    if (!trimmedCancelReason) {
      return res.status(400).json({
        ok: false,
        message: "El motivo de cancelación es obligatorio",
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        idOrder: Number(idOrder),
        userId: Number(req.idUser),
      },
      include: {
        shipments: true,
        sales: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Orden no encontrada",
      });
    }

    const blockedStatuses = new Set(["entregado", "cancelado", "disponible", "enviado"]);
    const hasBlockedShipment = order.shipments.some((shipment) =>
      blockedStatuses.has(String(shipment.status ?? "").toLowerCase()),
    );

    if (hasBlockedShipment) {
      return res.status(400).json({
        ok: false,
        message: "Esta compra ya no puede cancelarse por su estado de envío.",
      });
    }

    if (!isOrderWithinCancellationWindow(order)) {
      return res.status(400).json({
        ok: false,
        message: getOrderCancellationBlockMessage(),
      });
    }

    const pasarelaResult = await cancelOrderWithGatewayRefund(
      Number(order.idOrder),
      Number(req.idUser),
      req.headers.authorization,
      trimmedCancelReason,
    );

    const gateway = pasarelaResult?.data?.data?.gateway;
    const refunded = pasarelaResult?.data?.data?.refunded === true;
    const refundError =
      pasarelaResult?.data?.data?.refundError != null
        ? String(pasarelaResult.data.data.refundError)
        : null;

    // Misma BD: la pasarela ya marcó order/sales/shipments; reforzamos status local.
    await prisma.order.update({
      where: { idOrder: Number(order.idOrder) },
      data: {
        status: "cancelled",
        cancelReason: trimmedCancelReason,
        updatedAt: new Date(),
      },
    });
    await prisma.sales.updateMany({
      where: {
        orderId: Number(order.idOrder),
        userId: Number(req.idUser),
      },
      data: {
        status: "cancelled",
        shipStatus: "cancelado",
        statusChangedAt: new Date(),
      },
    });
    await prisma.shipments.updateMany({
      where: { orderId: Number(order.idOrder) },
      data: {
        status: "cancelado",
        lastUpdated: new Date(),
        statusChangedAt: new Date(),
      },
    });

    return res.status(200).json({
      ok: true,
      message: refundError
        ? "Compra cancelada. El reembolso automático quedó pendiente."
        : pasarelaResult?.message ?? "Compra cancelada correctamente",
      data: {
        data: {
          idOrder: Number(order.idOrder),
          payment_method: order.pay_method,
          refunded,
          refundError,
          gateway: gateway ?? null,
          cancelReason: trimmedCancelReason,
          status: "cancelled",
        },
      },
    });
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response) {
      const upstreamStatus = Number(error.response.status) || 502;
      // No reenviar 404 de la pasarela como si /sales/cancelOrder no existiera.
      const status =
        upstreamStatus === 404 ? 502 : upstreamStatus;
      return res.status(status).json({
        ok: false,
        message:
          error.response.data?.message ||
          "No se pudo cancelar la compra en la pasarela de pagos",
        error: error.response.data?.error,
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

/** Admin: envía correo de entrega digital con clave(s) de licencia. */
export const sendLicenseKeyEmailAdmin = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const adminUser = await prisma.users.findUnique({
      where: { idUser: Number(req.idUser) },
      select: { role: true },
    });

    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({
        ok: false,
        message: "Acceso denegado. Se requieren permisos de administrador.",
      });
    }

    const {
      idOrder,
      idShipment,
      idSale,
      toEmail,
      customerName,
      productName,
      licenseKeys,
      instructions,
    } = req.body || {};

    const email = String(toEmail || "")
      .trim()
      .toLowerCase();
    const keys = Array.isArray(licenseKeys)
      ? licenseKeys.map((k: unknown) => String(k || "").trim()).filter(Boolean)
      : String(licenseKeys || "")
          .split(/\r?\n/)
          .map((k) => k.trim())
          .filter(Boolean);

    if (!idOrder || !email || !productName || !keys.length || !idSale) {
      return res.status(400).json({
        ok: false,
        message:
          "Faltan campos: idOrder, idSale, toEmail, productName y al menos una clave.",
      });
    }

    const saleRow = await prisma.sales.findFirst({
      where: {
        idSale: BigInt(Number(idSale)),
        orderId: BigInt(Number(idOrder)),
      },
      include: {
        products: {
          select: {
            name: true,
            licenseType: true,
            image_url: true,
            description: true,
            upc: true,
            sku: true,
          },
        },
        shipments: { select: { idShipment: true, shipping_method: true } },
      },
    });

    if (!saleRow) {
      return res.status(404).json({
        ok: false,
        message: `Venta #${idSale} no encontrada en la orden #${idOrder}.`,
      });
    }

    if (
      idShipment &&
      saleRow.shipmentId &&
      Number(saleRow.shipmentId) !== Number(idShipment)
    ) {
      return res.status(400).json({
        ok: false,
        message: `La venta #${idSale} no pertenece al envío ${idShipment}.`,
      });
    }

    const resolvedProductName =
      String(productName).trim() ||
      String(saleRow.products?.name || "").trim() ||
      "Licencia";

    const expectedKeys = Math.max(1, Number(saleRow.quantity) || 1);
    if (keys.length < expectedKeys) {
      return res.status(400).json({
        ok: false,
        message: `Esta línea tiene ${expectedKeys} unidad(es). Debes enviar ${expectedKeys} clave(s).`,
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        ok: false,
        message: "El correo del destinatario no es válido.",
      });
    }

    const order = await prisma.order.findFirst({
      where: { idOrder: Number(idOrder) },
      include: {
        users: { select: { name: true, lastname: true, email: true } },
        shipments: idShipment
          ? { where: { idShipment: Number(idShipment) } }
          : true,
      },
    });

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: `Orden #${idOrder} no encontrada.`,
      });
    }

    const paymentStatus = String(order.status || "")
      .toLowerCase()
      .trim();
    if (paymentStatus !== "paid" && paymentStatus !== "approved") {
      return res.status(400).json({
        ok: false,
        message:
          "Solo se puede enviar la licencia cuando la orden está pagada.",
      });
    }

    if (idShipment) {
      const shipment = order.shipments?.[0];
      if (!shipment) {
        return res.status(404).json({
          ok: false,
          message: `Shipment ${idShipment} no pertenece a la orden #${idOrder}.`,
        });
      }
    }

    const resolvedName =
      String(customerName || "").trim() ||
      [order.users?.name, order.users?.lastname].filter(Boolean).join(" ") ||
      "cliente";

    const productImageUrl = resolveProductImageUrl(saleRow.products?.image_url);

    const mailResult = await sendLicenseKeyEmail(email, {
      customerName: resolvedName,
      idOrder: Number(idOrder),
      productName: resolvedProductName,
      productDescription: saleRow.products?.description ?? null,
      productUpc: saleRow.products?.upc ?? null,
      productSku: saleRow.products?.sku ?? null,
      quantity: expectedKeys,
      licenseKeys: keys,
      productImageUrl,
      ...(instructions
        ? { instructions: String(instructions) }
        : {}),
    });

    if (mailResult?.status === 400) {
      return res.status(400).json({
        ok: false,
        message: mailResult.error || "No se pudo enviar el correo.",
      });
    }

    let shipmentMarkedEntregado = false;
    let resolvedShipmentId = saleRow.shipmentId
      ? Number(saleRow.shipmentId)
      : idShipment
        ? Number(idShipment)
        : null;

    try {
      const deliveryResult = await markSaleLicenseDeliveredAndMaybeCloseShipment({
        idSale: Number(idSale),
        idOrder: Number(idOrder),
        authorization: req.headers.authorization!,
        userId: Number(order.userId),
      });
      shipmentMarkedEntregado = deliveryResult.shipmentMarkedEntregado;
      resolvedShipmentId = deliveryResult.idShipment ?? resolvedShipmentId;
    } catch (statusError: any) {
      console.error(
        "[sendLicenseKeyEmailAdmin] Correo enviado pero falló marcar entrega por venta",
        statusError,
      );
      return res.status(500).json({
        ok: false,
        message:
          `El correo de licencia se envió a ${email}, pero no se pudo registrar la entrega de la venta #${idSale}. ` +
          "Revisa el panel e intenta de nuevo o marca manualmente el estado.",
        data: {
          idOrder: Number(idOrder),
          idSale: Number(idSale),
          idShipment: resolvedShipmentId,
          toEmail: email,
          keysSent: keys.length,
          emailSent: true,
          saleDelivered: false,
        },
        error: statusError?.message,
      });
    }

    return res.status(200).json({
      ok: true,
      message: `Correo de licencia enviado a ${email}`,
      data: {
        idOrder: Number(idOrder),
        idSale: Number(idSale),
        idShipment: resolvedShipmentId,
        toEmail: email,
        keysSent: keys.length,
        saleDelivered: true,
        shipStatus: "entregado",
        shipmentStatus: shipmentMarkedEntregado ? "entregado" : null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno al enviar la licencia por correo",
      error: error?.message,
    });
  }
};
