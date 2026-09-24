"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLicenseKeyEmailAdmin = exports.cancelOrderByUser = exports.filterSales = exports.historySalesByUser = exports.getSalesByUser = exports.getPedidosByUser = exports.registerSales = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const index_service_1 = require("./../../services/index.service");
const pasarelaPagos_service_1 = require("../../services/pasarelaPagos.service");
const orderCancellationWindow_service_1 = require("../../services/orderCancellationWindow.service");
const axios_1 = __importDefault(require("axios"));
const shipmentCosts_1 = require("../../utils/shipmentCosts");
const resend_service_1 = require("../../services/resend.service");
function isDigitalLicenseType(licenseType) {
    const value = String(licenseType ?? "").toLowerCase();
    return value === "windows" || value === "antivirus" || value === "office";
}
function isDigitalLicenseSale(params) {
    return (String(params.shippingMethod ?? "").toLowerCase() === "digital" ||
        isDigitalLicenseType(params.licenseType));
}
async function markSaleLicenseDeliveredAndMaybeCloseShipment(params) {
    const deliveredAt = new Date();
    const sale = await prismaClient_1.prisma.sales.update({
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
    const shipment = await prismaClient_1.prisma.shipments.findUnique({
        where: { idShipment: BigInt(shipmentId) },
        select: { shipping_method: true, status: true },
    });
    const salesOnShipment = await prismaClient_1.prisma.sales.findMany({
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
        if (!isDigital)
            return true;
        return row.licenseDeliveredAt != null;
    });
    if (!allDigitalSalesDelivered) {
        return { shipmentMarkedEntregado: false, idShipment: shipmentId };
    }
    await prismaClient_1.prisma.shipments.update({
        where: { idShipment: BigInt(shipmentId) },
        data: {
            status: "entregado",
            lastUpdated: deliveredAt,
            statusChangedAt: deliveredAt,
        },
    });
    await (0, pasarelaPagos_service_1.syncShipmentStatusOnPasarela)({
        idShipment: shipmentId,
        status: "entregado",
        idUser: params.userId,
        authorization: params.authorization,
    });
    return { shipmentMarkedEntregado: true, idShipment: shipmentId };
}
function normalizeHistorySearchTerm(raw) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/^#+/, "");
}
function orderMatchesHistorySearch(order, rawTerm) {
    const term = normalizeHistorySearchTerm(rawTerm);
    if (!term)
        return true;
    const orderId = String(order.idOrder);
    if (orderId.includes(term))
        return true;
    const termDigits = term.replace(/\D/g, "");
    if (termDigits && orderId.includes(termDigits))
        return true;
    return order.products.some((product) => {
        const searchableValues = [
            product.name,
            product.description,
            product.idProduct,
            product.trackingNumber,
        ];
        return searchableValues.some((value) => String(value ?? "")
            .toLowerCase()
            .includes(term));
    });
}
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
            const quantity = Number(sale.quantity);
            const productId = Number(sale.productId);
            await prismaClient_1.prisma.products.update({
                where: {
                    idProduct: productId,
                    stock: {
                        gte: quantity,
                    },
                },
                data: {
                    stock: { decrement: quantity },
                },
            });
            try {
                await prismaClient_1.prisma.inventory_movements.create({
                    data: {
                        productId,
                        branchId: null,
                        userId: Number(req.idUser) || null,
                        delta: -quantity,
                        reason: "web_sale",
                        refType: "order",
                        refId: String(idOrder),
                        note: `Venta web orden ${idOrder}`,
                    },
                });
            }
            catch {
                // tabla puede no existir aún si no corrieron migraciones POS
            }
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
        const slcAllSalesUser = await prismaClient_1.prisma.order.findFirst({
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
            prismaClient_1.prisma.sales.count({ where: { orderId } }),
            prismaClient_1.prisma.sales.findMany({
                where: { orderId },
                include: {
                    products: true,
                },
                orderBy: { idSale: "asc" },
                skip,
                take: pageSize,
            }),
            prismaClient_1.prisma.sales.findMany({
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
            sales = await prismaClient_1.prisma.sales.findMany({
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
            ...new Set(slcAllSalesUser.shipments
                .map((shipment) => shipment.storeId)
                .filter((storeId) => storeId != null && storeId > 0)),
        ];
        const branches = branchIds.length > 0
            ? await prismaClient_1.prisma.branches.findMany({
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
        const branchById = new Map(branches.map((branch) => [Number(branch.idBranche), branch]));
        const { shippingTotal, insuranceTotal } = (0, shipmentCosts_1.sumShipmentCostTotals)(slcAllSalesUser.shipments);
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
                shippingCost: (0, shipmentCosts_1.toMoneyNumber)(shipment.shippingCost),
                insuranceCost: (0, shipmentCosts_1.toMoneyNumber)(shipment.insuranceCost),
                branch: branchById.get(Number(shipment.storeId)) ?? null,
            })),
        };
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: (0, index_service_1.parseBigInts)(orderWithBranches),
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
        const paidHistory = (history || []).filter((item) => {
            const saleStatus = String(item.status ?? "");
            return saleStatus === "paid" || saleStatus === "cancelled";
        });
        return res.status(200).json({
            ok: true,
            message: "OK!",
            data: {
                data: paidHistory.length > 0 ? (0, index_service_1.parseBigInts)(paidHistory) : [],
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
        const { status = "allState", paymentStatus = "allPayment", startDate = "", endDate = "", searchProduct = "", page = 1, limit = 10, } = req.body;
        const pageNumber = Math.max(1, Number(page) || 1);
        const pageSize = Math.min(50, Math.max(1, Number(limit) || 10));
        const normalizedPaymentStatus = String(paymentStatus || "allPayment")
            .trim()
            .toLowerCase();
        const orderStatusesForFilter = (() => {
            if (normalizedPaymentStatus === "paid" ||
                normalizedPaymentStatus === "pagado") {
                return ["paid"];
            }
            if (normalizedPaymentStatus === "pending" ||
                normalizedPaymentStatus === "payment_pending" ||
                normalizedPaymentStatus === "pendiente") {
                return ["payment_pending", "pending"];
            }
            if (normalizedPaymentStatus === "cancelled" ||
                normalizedPaymentStatus === "canceled" ||
                normalizedPaymentStatus === "cancelado") {
                return ["cancelled", "refunded"];
            }
            // Historial: pagadas, pendientes de pago (SPEI/OXXO) y canceladas.
            // Excluye borradores (`pay_method: esperando`) y rechazos/contracargos.
            return ["paid", "payment_pending", "cancelled", "refunded"];
        })();
        const orders = await prismaClient_1.prisma.order.findMany({
            where: {
                userId: Number(req.idUser),
                pay_method: {
                    not: "esperando",
                },
                status: {
                    in: [...orderStatusesForFilter],
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
            const { shippingTotal, insuranceTotal } = (0, shipmentCosts_1.sumShipmentCostTotals)(order.shipments);
            return {
                idOrder: order.idOrder,
                totalSales: Number(order.totalAmount ?? 0),
                shippingTotal,
                insuranceTotal,
                createdAt: order?.createdAt,
                updatedAt: order?.updatedAt,
                payment_method: order.pay_method,
                cardLast4: order.cardLast4 ?? null,
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
                        lineTotal: (0, shipmentCosts_1.toMoneyNumber)(sale.total),
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
                        shippingCost: (0, shipmentCosts_1.toMoneyNumber)(shipment?.shippingCost),
                        insuranceCost: (0, shipmentCosts_1.toMoneyNumber)(shipment?.insuranceCost),
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
            const statusMatch = status && status !== "allState"
                ? order.products.some((product) => product.statusShip === status)
                : true;
            const dateMatch = startDate && endDate
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
                data: paginated.length > 0 ? (0, index_service_1.parseBigInts)(paginated) : [],
                pagination: {
                    page: safePage,
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
const cancelOrderByUser = async (req, res) => {
    try {
        const { idOrder, cancelReason } = req.body;
        const trimmedCancelReason = cancelReason != null && String(cancelReason).trim()
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
        const order = await prismaClient_1.prisma.order.findFirst({
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
        const hasBlockedShipment = order.shipments.some((shipment) => blockedStatuses.has(String(shipment.status ?? "").toLowerCase()));
        if (hasBlockedShipment) {
            return res.status(400).json({
                ok: false,
                message: "Esta compra ya no puede cancelarse por su estado de envío.",
            });
        }
        if (!(0, orderCancellationWindow_service_1.isOrderWithinCancellationWindow)(order)) {
            return res.status(400).json({
                ok: false,
                message: (0, orderCancellationWindow_service_1.getOrderCancellationBlockMessage)(),
            });
        }
        const pasarelaResult = await (0, pasarelaPagos_service_1.cancelOrderWithGatewayRefund)(Number(order.idOrder), Number(req.idUser), req.headers.authorization, trimmedCancelReason);
        const gateway = pasarelaResult?.data?.data?.gateway;
        const refunded = pasarelaResult?.data?.data?.refunded === true;
        const refundError = pasarelaResult?.data?.data?.refundError != null
            ? String(pasarelaResult.data.data.refundError)
            : null;
        // Misma BD: la pasarela ya marcó order/sales/shipments; reforzamos status local.
        await prismaClient_1.prisma.order.update({
            where: { idOrder: Number(order.idOrder) },
            data: {
                status: "cancelled",
                cancelReason: trimmedCancelReason,
                updatedAt: new Date(),
            },
        });
        await prismaClient_1.prisma.sales.updateMany({
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
        await prismaClient_1.prisma.shipments.updateMany({
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
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error) && error.response) {
            const upstreamStatus = Number(error.response.status) || 502;
            // No reenviar 404 de la pasarela como si /sales/cancelOrder no existiera.
            const status = upstreamStatus === 404 ? 502 : upstreamStatus;
            return res.status(status).json({
                ok: false,
                message: error.response.data?.message ||
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
exports.cancelOrderByUser = cancelOrderByUser;
/** Admin: envía correo de entrega digital con clave(s) de licencia. */
const sendLicenseKeyEmailAdmin = async (req, res) => {
    try {
        const adminUser = await prismaClient_1.prisma.users.findUnique({
            where: { idUser: Number(req.idUser) },
            select: { role: true },
        });
        if (!adminUser || adminUser.role !== "admin") {
            return res.status(403).json({
                ok: false,
                message: "Acceso denegado. Se requieren permisos de administrador.",
            });
        }
        const { idOrder, idShipment, idSale, toEmail, customerName, productName, licenseKeys, instructions, } = req.body || {};
        const email = String(toEmail || "")
            .trim()
            .toLowerCase();
        const keys = Array.isArray(licenseKeys)
            ? licenseKeys.map((k) => String(k || "").trim()).filter(Boolean)
            : String(licenseKeys || "")
                .split(/\r?\n/)
                .map((k) => k.trim())
                .filter(Boolean);
        if (!idOrder || !email || !productName || !keys.length || !idSale) {
            return res.status(400).json({
                ok: false,
                message: "Faltan campos: idOrder, idSale, toEmail, productName y al menos una clave.",
            });
        }
        const saleRow = await prismaClient_1.prisma.sales.findFirst({
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
        if (idShipment &&
            saleRow.shipmentId &&
            Number(saleRow.shipmentId) !== Number(idShipment)) {
            return res.status(400).json({
                ok: false,
                message: `La venta #${idSale} no pertenece al envío ${idShipment}.`,
            });
        }
        const resolvedProductName = String(productName).trim() ||
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
        const order = await prismaClient_1.prisma.order.findFirst({
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
                message: "Solo se puede enviar la licencia cuando la orden está pagada.",
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
        const resolvedName = String(customerName || "").trim() ||
            [order.users?.name, order.users?.lastname].filter(Boolean).join(" ") ||
            "cliente";
        const productImageUrl = (0, resend_service_1.resolveProductImageUrl)(saleRow.products?.image_url);
        const mailResult = await (0, resend_service_1.sendLicenseKeyEmail)(email, {
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
                authorization: req.headers.authorization,
                userId: Number(order.userId),
            });
            shipmentMarkedEntregado = deliveryResult.shipmentMarkedEntregado;
            resolvedShipmentId = deliveryResult.idShipment ?? resolvedShipmentId;
        }
        catch (statusError) {
            console.error("[sendLicenseKeyEmailAdmin] Correo enviado pero falló marcar entrega por venta", statusError);
            return res.status(500).json({
                ok: false,
                message: `El correo de licencia se envió a ${email}, pero no se pudo registrar la entrega de la venta #${idSale}. ` +
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error interno al enviar la licencia por correo",
            error: error?.message,
        });
    }
};
exports.sendLicenseKeyEmailAdmin = sendLicenseKeyEmailAdmin;
//# sourceMappingURL=sales.controller.js.map