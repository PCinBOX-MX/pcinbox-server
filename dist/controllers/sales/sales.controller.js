"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterSales = exports.historySalesByUser = exports.getSalesByUser = exports.getPedidosByUser = exports.registerSales = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const index_service_1 = require("./../../services/index.service");
const sales_query_1 = require("./../../query/sales.query");
const order_cancellation_policy_1 = require("../../services/order-cancellation.policy");
const registerSales = async (req, res) => {
    try {
        const { dataCart, idOrder, total } = req.body;
        const slcCart = await prismaClient_1.prisma.carts.findFirst({
            where: {
                userId: Number(req.idUser),
            },
        });
        if (!slcCart) {
            return res
                .status(400)
                .json({ ok: false, message: "Carrito no encontrado" });
        }
        await prismaClient_1.prisma.sales.createMany({
            data: dataCart.map((product) => ({
                userId: Number(req.idUser),
                productId: Number(product.idProduct),
                orderId: Number(idOrder),
                quantity: Number(product.quantity),
                total: total,
                status: "paid",
            })),
        });
        await prismaClient_1.prisma.cartItems.updateMany({
            where: {
                carId: slcCart.idCart,
                productId: { in: dataCart.map((item) => Number(item.idProduct)) },
            },
            data: {
                active: 0,
                quantity: 0,
            },
        });
        const slcSales = await prismaClient_1.prisma.sales.findMany({
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
            await prismaClient_1.prisma.products.update({
                where: {
                    idProduct: Number(sale.productId),
                    stock: {
                        gte: Number(sale.quantity),
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.registerSales = registerSales;
const getPedidosByUser = async (req, res) => {
    try {
        const getAllPedidosByUser = await prismaClient_1.prisma.$queryRawUnsafe((0, sales_query_1.querySales)({ idUser: Number(req.idUser) }));
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: getAllPedidosByUser.map((item) => {
                    const parsedItem = {};
                    for (const key in item) {
                        if (typeof item[key] === "bigint") {
                            parsedItem[key] = Number(item[key]); // o .toString() si quieres evitar problemas de overflow
                        }
                        else {
                            parsedItem[key] = item[key];
                        }
                    }
                    return parsedItem;
                }),
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.getPedidosByUser = getPedidosByUser;
const getSalesByUser = async (req, res) => {
    try {
        const { idOrder } = req.body;
        if (!idOrder) {
            return res
                .status(400)
                .json({ ok: false, message: "Falta mandar el idOrder en el body" });
        }
        const slcAllSalesUser = await prismaClient_1.prisma.order.findFirst({
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
                techsmart_orders: true,
            },
        });
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: (0, index_service_1.parseBigInts)(slcAllSalesUser),
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.getSalesByUser = getSalesByUser;
const historySalesByUser = async (req, res) => {
    try {
        const slcUser = await prismaClient_1.prisma.users.findFirst({
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
        const history = await prismaClient_1.prisma.$queryRawUnsafe((0, sales_query_1.querySales)({ idUser: req.idUser }));
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: history && history.length > 0 ? (0, index_service_1.parseBigInts)(history) : [],
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.historySalesByUser = historySalesByUser;
function mapOrdersToHistoryResponse(orders) {
    return orders.map((order) => {
        const shipmentById = new Map(order.shipments.map((shipment) => [
            Number(shipment.idShipment),
            shipment,
        ]));
        const cancellation = (0, order_cancellation_policy_1.evaluateOrderCancellation)({
            orderStatus: order.status,
            orderCreatedAt: order.createdAt,
            orderUpdatedAt: order.updatedAt,
            sales: order.sales,
            shipmentStatuses: order.shipments
                .map((shipment) => shipment.status)
                .filter((status) => status != null),
            techsmartOrderStatus: order.techsmart_orders?.status ?? null,
            dicotechPurchaseIds: (order.purchases ?? []).map((purchase) => purchase.purchaseId),
        });
        return {
            idOrder: order.idOrder,
            totalSales: order.sales.length,
            createdAt: order?.createdAt,
            updatedAt: order?.updatedAt,
            payment_method: order.pay_method,
            orderStatus: order.status,
            idUser: Number(order.userId),
            canCancel: cancellation.canCancel,
            cancelReason: cancellation.reason,
            cancelDeadline: cancellation.cancelDeadline,
            hoursRemaining: cancellation.hoursRemaining,
            hasTechsmartProducts: cancellation.hasTechsmartProducts,
            techsmartOrder: order.techsmart_orders
                ? {
                    folioPedido: order.techsmart_orders.folioPedido,
                    guiaPedido: order.techsmart_orders.guiaPedido,
                    folioFactura: order.techsmart_orders.folioFactura,
                    status: order.techsmart_orders.status,
                    wsError: order.techsmart_orders.wsError,
                }
                : null,
            products: order.sales.map((sale) => {
                const shipment = (sale.shipmentId
                    ? shipmentById.get(Number(sale.shipmentId))
                    : null) ||
                    order.shipments.find((entry) => entry.shipping_method === "sucursal") ||
                    order.shipments[0] ||
                    null;
                return {
                    idShipment: shipment?.idShipment,
                    description: sale.products?.description,
                    price: sale?.products?.price,
                    idProduct: sale.products.idProduct,
                    name: sale.products.name,
                    quantity: sale.quantity,
                    providerId: sale.products?.providerId,
                    statusShip: shipment?.status,
                    shipping_method: shipment?.shipping_method,
                    status: sale.status,
                    image_url: sale?.products?.image_url,
                    trackingNumber: shipment?.trackingNumber ||
                        order?.techsmart_orders?.guiaPedido ||
                        null,
                    address: shipment?.addresses
                        ? {
                            idAddress: Number(shipment.addresses?.idAddress),
                            userId: Number(shipment.addresses?.userId),
                            street: shipment.addresses?.street,
                            noExt: shipment.addresses?.noExt,
                            noInt: shipment.addresses?.noInt,
                            cologne: shipment.addresses?.cologne,
                            city: shipment.addresses?.city,
                            state: shipment.addresses?.state,
                            country: shipment.addresses?.country,
                            postalCode: shipment.addresses?.postalCode,
                            phone1: shipment.addresses?.phone1,
                            phone2: shipment.addresses?.phone2,
                            createdAt: shipment.addresses?.createdAt,
                            updatedAt: shipment.addresses?.updatedAt,
                            active: shipment.addresses?.active,
                        }
                        : null,
                };
            }),
        };
    });
}
const historyOrderInclude = {
    techsmart_orders: true,
    purchases: {
        select: {
            purchaseId: true,
        },
    },
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
};
function buildHistoryOrdersWhere(userId, filters) {
    const where = {
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
const filterSales = async (req, res) => {
    try {
        const { status, page = 1, limit = 6, startDate, endDate, searchProduct } = req.body;
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
            prismaClient_1.prisma.order.findMany({
                where,
                orderBy: { idOrder: "desc" },
                skip: (pageNumber - 1) * pageSize,
                take: pageSize,
                include: historyOrderInclude,
            }),
            prismaClient_1.prisma.order.count({ where }),
        ]);
        const parserOrder = mapOrdersToHistoryResponse(orders);
        const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: parserOrder.length > 0 ? (0, index_service_1.parseBigInts)(parserOrder) : [],
                pagination: {
                    page: pageNumber,
                    limit: pageSize,
                    total,
                    totalPages,
                },
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno del servidor",
            error: error.message,
        });
    }
};
exports.filterSales = filterSales;
//# sourceMappingURL=sales.controller.js.map