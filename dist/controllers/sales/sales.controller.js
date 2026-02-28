"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterSales = exports.historySalesByUser = exports.getSalesByUser = exports.getPedidosByUser = exports.registerSales = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const index_service_1 = require("./../../services/index.service");
const sales_query_1 = require("./../../query/sales.query");
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
const filterSales = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({
                ok: false,
                message: "Faltan campos por enviar en el body",
            });
        }
        // const record: any = await prisma.$queryRawUnsafe(
        //   querySalesWithStatus(userId, status)
        // );
        let orders = await prismaClient_1.prisma.order.findMany({
            where: {
                userId: Number(req.idUser),
                pay_method: {
                    not: "esperando",
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
                            },
                        },
                    },
                },
            },
        });
        let parserOrder = orders.map((order) => {
            return {
                idOrder: order.idOrder,
                totalSales: order.sales.length,
                createdAt: order?.createdAt,
                updatedAt: order?.updatedAt,
                payment_method: order.pay_method,
                idUser: Number(order.userId),
                products: order.sales.map((sale, indexSale) => {
                    // buscar shipment que tenga el mismo productId (si tu Shipment lo tiene)
                    // const shipmentForSale = order.shipments.find(
                    //   (sh) => Number(sh.idShipment) === Number(sale.shipmentId),
                    // );
                    return {
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
                        // shippingType: shipmentForSale ? "envio" : "sucursal",
                        address: order?.shipments[indexSale]?.addresses
                            ? {
                                idAddress: Number(order?.shipments[indexSale].addresses?.idAddress),
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
                    };
                }),
            };
        });
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: parserOrder && parserOrder.length > 0
                    ? (0, index_service_1.parseBigInts)(parserOrder)
                    : [],
                //  data: record && record.length > 0 ? parseBigInts(record) : [],
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