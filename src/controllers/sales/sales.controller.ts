import { prisma } from "../../db/prismaClient";
import { Response, Request } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
import { parseBigInts } from "./../../services/index.service";

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

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: history && history.length > 0 ? parseBigInts(history) : [],
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

function mapOrdersToHistoryResponse(orders: any[]) {
  return orders.map((order) => ({
    idOrder: order.idOrder,
    totalSales: order.sales.length,
    createdAt: order?.createdAt,
    updatedAt: order?.updatedAt,
    payment_method: order.pay_method,
    orderStatus: order.status,
    idUser: Number(order.userId),
    products: order.sales.map((sale: any, indexSale: number) => ({
      idShipment: order?.shipments[indexSale]?.idShipment,
      description: sale.products?.description,
      price: sale?.products?.price,
      idProduct: sale.products.idProduct,
      name: sale.products.name,
      quantity: sale.quantity,
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
}

const historyOrderInclude = {
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
        },
      },
    },
  },
} as const;

function buildHistoryOrdersWhere(
  userId: number,
  filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
    searchProduct?: string;
  },
) {
  const where: any = {
    userId,
    pay_method: { not: "esperando" },
    status: { not: "payment_pending" },
  };

  if (filters.status && filters.status !== "allState") {
    where.shipments = { some: { status: filters.status } };
  }

  if (filters.startDate && filters.endDate) {
    const start = new Date(filters.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    where.createdAt = { gte: start, lte: end };
  }

  const search = filters.searchProduct?.trim();
  if (search) {
    where.sales = {
      some: {
        products: {
          name: { contains: search },
        },
      },
    };
  }

  return where;
}

export const filterSales = async (req: CustomRequestI, res: Response) => {
  try {
    const { status, page = 1, limit = 6, startDate, endDate, searchProduct } =
      req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "Faltan campos por enviar en el body",
      });
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(20, Math.max(1, Number(limit) || 6));
    const userId = Number(req.idUser);
    const where = buildHistoryOrdersWhere(userId, {
      status,
      startDate,
      endDate,
      searchProduct,
    });

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { idOrder: "desc" },
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
        include: historyOrderInclude,
      }),
      prisma.order.count({ where }),
    ]);

    const parserOrder = mapOrdersToHistoryResponse(orders);
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    return res.status(200).json({
      ok: true,
      message: "OK!",
      data: {
        data: parserOrder.length > 0 ? parseBigInts(parserOrder) : [],
        pagination: {
          page: pageNumber,
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
