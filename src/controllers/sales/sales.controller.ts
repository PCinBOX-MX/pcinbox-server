import { prisma } from "../../db/prismaClient";
import { Response, Request } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { parseBigInts } from "./../../services/index.service";
import { cancelOrderWithGatewayRefund } from "../../services/pasarelaPagos.service";
import {
  getOrderCancellationBlockMessage,
  isOrderWithinCancellationWindow,
} from "../../services/orderCancellationWindow.service";
import axios from "axios";

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
    const { idOrder } = req.body;

    if (!idOrder) {
      return res
        .status(400)
        .json({ ok: false, message: "Falta mandar el idOrder en el body" });
    }

    const slcAllSalesUser = await prisma.order.findFirst({
      where: {
        idOrder: Number(idOrder),
        userId: Number(req.idUser),
      },
      include: {
        shipments: {
          include: {
            addresses: true,
          },
        },
        sales: {
          include: {
            products: true,
          },
        },
      },
    });
    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: parseBigInts(slcAllSalesUser),
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
          },
        },
      },
    });

    const parserOrder = orders.map((order) => ({
      idOrder: order.idOrder,
      totalSales: Number(order.totalAmount ?? 0),
      createdAt: order?.createdAt,
      updatedAt: order?.updatedAt,
      payment_method: order.pay_method,
      orderStatus: order.status,
      idUser: Number(order.userId),
      products: order.sales.map((sale, indexSale) => ({
        idShipment: order?.shipments[indexSale]?.idShipment,
        description: sale.products?.description,
        price: sale?.products?.price,
        idProduct: sale.products.idProduct,
        name: sale.products.name,
        quantity: sale.quantity,
        providerId: sale.products?.providerId,
        statusShip: order.shipments[indexSale]?.status,
        shipping_method: order?.shipments[indexSale]?.shipping_method,
        status: sale.status,
        image_url: sale?.products?.image_url,
        trackingNumber: order?.shipments[indexSale]?.trackingNumber,
        address: order?.shipments[indexSale]?.addresses
          ? {
              idAddress: Number(
                order?.shipments[indexSale].addresses?.idAddress,
              ),
              userId: Number(order?.shipments[indexSale].addresses?.userId),
              street: order?.shipments[indexSale].addresses?.street,
              noExt: order?.shipments[indexSale].addresses?.noExt,
              noInt: order?.shipments[indexSale].addresses?.noInt,
              cologne: order?.shipments[indexSale].addresses?.cologne,
              city: order?.shipments[indexSale].addresses?.city,
              state: order?.shipments[indexSale].addresses?.state,
              country: order?.shipments[indexSale].addresses?.country,
              postalCode: order?.shipments[indexSale].addresses?.postalCode,
              phone1: order?.shipments[indexSale].addresses?.phone1,
              phone2: order?.shipments[indexSale].addresses?.phone2,
              createdAt: order?.shipments[indexSale].addresses?.createdAt,
              updatedAt: order?.shipments[indexSale].addresses?.updatedAt,
              active: order?.shipments[indexSale].addresses?.active,
            }
          : null,
      })),
    }));

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
    const { idOrder } = req.body;

    if (!idOrder) {
      return res.status(400).json({
        ok: false,
        message: "Falta idOrder",
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
      blockedStatuses.has(String(shipment.status ?? "")),
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
    );

    return res.status(200).json({
      ok: true,
      message: pasarelaResult?.message ?? "Compra cancelada correctamente",
      data: {
        data: {
          idOrder: Number(order.idOrder),
          payment_method: order.pay_method,
          refunded: pasarelaResult?.data?.data?.refunded ?? false,
        },
      },
    });
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json({
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
