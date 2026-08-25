"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPosSaleTicket = exports.retryPosPaymentLink = exports.confirmPosPayment = exports.cancelPosSale = exports.getPosSaleById = exports.listPosSales = exports.createPosSale = exports.searchPosCustomers = exports.searchPosProductsHandler = exports.listPosBranches = void 0;
const client_1 = require("@prisma/client");
const prismaClient_1 = require("../../db/prismaClient");
const pos_service_1 = require("../../services/pos/pos.service");
const posStock_service_1 = require("../../services/pos/posStock.service");
const pasarelaPagos_service_1 = require("../../services/pasarelaPagos.service");
const PAYMENT_METHODS = new Set([
    "efectivo_sucursal",
    "tarjeta_sucursal",
    "transferencia_bancaria",
    "openpay_link",
]);
function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v))
        return NaN;
    return (0, pos_service_1.roundMoney)(v);
}
async function resolveIsAdmin(userId) {
    const user = await prismaClient_1.prisma.users.findFirst({
        where: { idUser: userId, active: 1 },
        select: { role: true },
    });
    return user?.role === "admin";
}
function serializeSale(sale) {
    return {
        idPosSale: Number(sale.idPosSale),
        folio: sale.folio,
        branchId: Number(sale.branchId),
        branchName: sale.branches?.name || null,
        branchCity: sale.branches?.city || null,
        cashierUserId: Number(sale.cashierUserId),
        cashierName: sale.cashier
            ? `${sale.cashier.name || ""} ${sale.cashier.lastname || ""}`.trim()
            : null,
        customerUserId: sale.customerUserId ? Number(sale.customerUserId) : null,
        customerName: sale.customerName ||
            (sale.customer
                ? `${sale.customer.name || ""} ${sale.customer.lastname || ""}`.trim()
                : "Público general"),
        status: sale.status,
        subtotal: Number(sale.subtotal),
        discountTotal: Number(sale.discountTotal),
        total: Number(sale.total),
        notes: sale.notes,
        cancelReason: sale.cancelReason,
        cancelledAt: sale.cancelledAt,
        customerEmail: sale.customerEmail || null,
        customerPhone: sale.customerPhone || null,
        paymentLinkUrl: sale.paymentLinkUrl || null,
        checkoutLinkUrl: sale.checkoutLinkUrl || null,
        linkReferencia: sale.linkReferencia || null,
        idLinkPago: sale.idLinkPago != null ? Number(sale.idLinkPago) : null,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: (sale.items || []).map((it) => ({
            idPosSaleItem: Number(it.idPosSaleItem),
            productId: Number(it.productId),
            productName: it.productName,
            productSku: it.productSku,
            productUpc: it.productUpc,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            discountPct: Number(it.discountPct),
            lineTotal: Number(it.lineTotal),
        })),
        payments: (sale.payments || []).map((p) => ({
            idPosPayment: Number(p.idPosPayment),
            method: p.method,
            amount: Number(p.amount),
            reference: p.reference,
            createdAt: p.createdAt,
        })),
        events: (sale.events || []).map((e) => ({
            idPosSaleEvent: Number(e.idPosSaleEvent),
            eventType: e.eventType,
            reason: e.reason,
            payload: e.payload,
            userId: e.userId ? Number(e.userId) : null,
            createdAt: e.createdAt,
        })),
    };
}
const saleInclude = {
    branches: { select: { name: true, city: true } },
    cashier: { select: { name: true, lastname: true } },
    customer: { select: { name: true, lastname: true, email: true } },
    items: true,
    payments: true,
    events: { orderBy: { createdAt: "asc" } },
};
const listPosBranches = async (_req, res) => {
    try {
        const branches = await prismaClient_1.prisma.branches.findMany({
            orderBy: [{ city: "asc" }, { name: "asc" }],
            select: {
                idBranche: true,
                name: true,
                city: true,
                providerId: true,
            },
        });
        return res.json({
            ok: true,
            data: branches.map((b) => ({
                idBranche: Number(b.idBranche),
                name: b.name,
                city: b.city,
                providerId: Number(b.providerId),
                label: [b.name, b.city].filter(Boolean).join(" — ") || `Sucursal ${b.idBranche}`,
            })),
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar sucursales",
        });
    }
};
exports.listPosBranches = listPosBranches;
const searchPosProductsHandler = async (req, res) => {
    try {
        const q = String(req.query.q || "");
        const branchId = Number(req.query.branchId);
        if (!Number.isSafeInteger(branchId) || branchId <= 0) {
            return res.status(400).json({
                ok: false,
                message: "Selecciona una sucursal válida",
            });
        }
        const data = await (0, pos_service_1.searchPosProducts)(q, branchId);
        return res.json({ ok: true, data });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al buscar productos",
        });
    }
};
exports.searchPosProductsHandler = searchPosProductsHandler;
const searchPosCustomers = async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 2) {
            return res.json({ ok: true, data: [] });
        }
        const users = await prismaClient_1.prisma.users.findMany({
            where: {
                active: 1,
                role: "customer",
                OR: [
                    { name: { contains: q } },
                    { lastname: { contains: q } },
                    { email: { contains: q } },
                    { phone: { contains: q } },
                ],
            },
            take: 20,
            orderBy: { name: "asc" },
            select: {
                idUser: true,
                name: true,
                lastname: true,
                email: true,
                phone: true,
            },
        });
        return res.json({
            ok: true,
            data: users.map((u) => ({
                idUser: Number(u.idUser),
                name: u.name,
                lastname: u.lastname,
                email: u.email,
                phone: u.phone,
                label: `${u.name || ""} ${u.lastname || ""}`.trim() + (u.email ? ` · ${u.email}` : ""),
            })),
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al buscar clientes",
        });
    }
};
exports.searchPosCustomers = searchPosCustomers;
const createPosSale = async (req, res) => {
    try {
        const cashierUserId = Number(req.idUser);
        if (!Number.isSafeInteger(cashierUserId) || cashierUserId <= 0) {
            return res.status(401).json({ ok: false, message: "Sesión inválida" });
        }
        const { branchId, customerUserId, customerName, customerEmail, customerPhone, notes, items, payments, } = req.body || {};
        const branch = Number(branchId);
        if (!Number.isSafeInteger(branch) || branch <= 0) {
            return res.status(400).json({ ok: false, message: "Sucursal requerida" });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ ok: false, message: "Agrega al menos un producto" });
        }
        if (!Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ ok: false, message: "Registra al menos una forma de pago" });
        }
        const isAdmin = await resolveIsAdmin(cashierUserId);
        const normalizedItems = [];
        let subtotal = 0;
        let discountTotal = 0;
        let hasOpenpayOnlyPending = false;
        for (const raw of items) {
            const productId = Number(raw.productId);
            const quantity = Number(raw.quantity);
            const discountPct = Number(raw.discountPct ?? 0);
            if (!Number.isSafeInteger(productId) || productId <= 0) {
                return res.status(400).json({ ok: false, message: "Producto inválido" });
            }
            if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ ok: false, message: "Cantidad inválida" });
            }
            try {
                (0, pos_service_1.assertDiscountAllowed)(discountPct, isAdmin);
            }
            catch (e) {
                return res.status(403).json({ ok: false, message: e.message });
            }
            const product = await prismaClient_1.prisma.products.findFirst({
                where: { idProduct: productId, active: 1 },
                select: {
                    idProduct: true,
                    name: true,
                    price: true,
                    sku: true,
                    upc: true,
                },
            });
            if (!product) {
                return res.status(404).json({
                    ok: false,
                    message: `Producto ${productId} no encontrado`,
                });
            }
            const unitPrice = raw.unitPrice != null && Number.isFinite(Number(raw.unitPrice))
                ? money(raw.unitPrice)
                : money(product.price);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                return res.status(400).json({ ok: false, message: "Precio inválido" });
            }
            const lineBase = (0, pos_service_1.roundMoney)(unitPrice * quantity);
            const lineTotal = (0, pos_service_1.computeLineTotal)(unitPrice, quantity, discountPct);
            subtotal = (0, pos_service_1.roundMoney)(subtotal + lineBase);
            discountTotal = (0, pos_service_1.roundMoney)(discountTotal + (lineBase - lineTotal));
            normalizedItems.push({
                productId,
                quantity,
                unitPrice,
                discountPct: (0, pos_service_1.roundMoney)(discountPct),
                lineTotal,
                productName: product.name,
                productSku: product.sku,
                productUpc: product.upc,
            });
        }
        const total = (0, pos_service_1.roundMoney)(subtotal - discountTotal);
        const normalizedPayments = [];
        let paidSum = 0;
        for (const raw of payments) {
            const method = String(raw.method || "");
            const amount = money(raw.amount);
            if (!PAYMENT_METHODS.has(method)) {
                return res.status(400).json({
                    ok: false,
                    message: `Método de pago no válido: ${method}`,
                });
            }
            if (!Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: "Monto de pago inválido",
                });
            }
            if (method === "openpay_link")
                hasOpenpayOnlyPending = true;
            paidSum = (0, pos_service_1.roundMoney)(paidSum + amount);
            normalizedPayments.push({
                method,
                amount,
                reference: raw.reference ? String(raw.reference).slice(0, 255) : null,
            });
        }
        if (Math.abs(paidSum - total) > 0.009) {
            return res.status(400).json({
                ok: false,
                message: `La suma de pagos (${paidSum}) debe igualar el total (${total})`,
            });
        }
        // OpenPay link alone → pending (no stock yet). Mixed with immediate methods not allowed with openpay in MVP.
        const onlyOpenpay = normalizedPayments.length === 1 &&
            normalizedPayments[0]?.method === "openpay_link";
        const hasOpenpay = normalizedPayments.some((p) => p.method === "openpay_link");
        if (hasOpenpay && !onlyOpenpay) {
            return res.status(400).json({
                ok: false,
                message: "OpenPay link no se puede combinar con otros métodos en esta versión. Cobra en efectivo/tarjeta/transferencia o solo con link.",
            });
        }
        const status = onlyOpenpay ? "pending_payment" : "completed";
        void hasOpenpayOnlyPending;
        let guestEmail = String(customerEmail || "").trim();
        let guestPhone = String(customerPhone || "").trim();
        let guestName = String(customerName || "").trim();
        let guestLastname = "";
        let customerUser = null;
        if (customerUserId != null && customerUserId !== "") {
            const cid = Number(customerUserId);
            if (!Number.isSafeInteger(cid) || cid <= 0) {
                return res.status(400).json({ ok: false, message: "Cliente inválido" });
            }
            const exists = await prismaClient_1.prisma.users.findFirst({
                where: { idUser: cid, active: 1 },
                select: {
                    idUser: true,
                    name: true,
                    lastname: true,
                    email: true,
                    phone: true,
                },
            });
            if (!exists) {
                return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
            }
            customerUser = cid;
            guestName = guestName || `${exists.name || ""}`.trim();
            guestLastname = exists.lastname || "";
            guestEmail = guestEmail || exists.email || "";
            guestPhone = guestPhone || exists.phone || "";
        }
        if (onlyOpenpay) {
            if (!guestEmail || !guestPhone) {
                return res.status(400).json({
                    ok: false,
                    message: "Para OpenPay link necesitas email y teléfono del cliente (o seleccionar un cliente registrado con esos datos).",
                });
            }
            if (!guestName)
                guestName = "Cliente POS";
        }
        const sale = await prismaClient_1.prisma.$transaction(async (tx) => {
            const folio = await (0, pos_service_1.nextPosFolio)(tx);
            const displayName = [guestName, guestLastname].filter(Boolean).join(" ").trim() ||
                (customerUser ? null : "Público general");
            const created = await tx.pos_sales.create({
                data: {
                    folio,
                    branchId: branch,
                    cashierUserId,
                    customerUserId: customerUser,
                    customerName: displayName,
                    customerEmail: onlyOpenpay ? guestEmail : guestEmail || null,
                    customerPhone: onlyOpenpay ? guestPhone : guestPhone || null,
                    status,
                    subtotal,
                    discountTotal,
                    total,
                    notes: notes ? String(notes).slice(0, 2000) : null,
                    items: {
                        create: normalizedItems.map((it) => ({
                            productId: it.productId,
                            productName: it.productName,
                            productSku: it.productSku,
                            productUpc: it.productUpc,
                            quantity: it.quantity,
                            unitPrice: new client_1.Prisma.Decimal(it.unitPrice),
                            discountPct: new client_1.Prisma.Decimal(it.discountPct),
                            lineTotal: new client_1.Prisma.Decimal(it.lineTotal),
                        })),
                    },
                    payments: {
                        create: normalizedPayments.map((p) => ({
                            method: p.method,
                            amount: new client_1.Prisma.Decimal(p.amount),
                            reference: p.reference,
                        })),
                    },
                    events: {
                        create: {
                            userId: cashierUserId,
                            eventType: "created",
                            reason: null,
                            payload: {
                                status,
                                total,
                                itemCount: normalizedItems.length,
                                isAdmin,
                            },
                        },
                    },
                },
                include: saleInclude,
            });
            if (status === "completed") {
                await (0, posStock_service_1.decrementPosStock)(tx, normalizedItems.map((it) => ({
                    productId: it.productId,
                    quantity: it.quantity,
                })), branch, cashierUserId, folio);
            }
            return created;
        });
        let paymentLink = null;
        let checkoutLink = null;
        let linkReferencia = null;
        if (onlyOpenpay) {
            try {
                const linkRes = await (0, pasarelaPagos_service_1.createLinkPayOnline)({
                    name: guestName,
                    lastname: guestLastname || null,
                    email: guestEmail,
                    phone: guestPhone,
                    monto: total,
                    products: normalizedItems.map((it) => ({
                        idProduct: it.productId,
                        name: it.productName,
                        price: it.lineTotal / it.quantity,
                        quantity: it.quantity,
                    })),
                });
                paymentLink = linkRes.link || null;
                checkoutLink = linkRes.checkoutLink || null;
                linkReferencia = linkRes.referencia || null;
                const openPayPayment = sale.payments.find((p) => p.method === "openpay_link");
                if (openPayPayment) {
                    await prismaClient_1.prisma.pos_payments.update({
                        where: { idPosPayment: openPayPayment.idPosPayment },
                        data: {
                            reference: [
                                linkReferencia,
                                paymentLink,
                                checkoutLink,
                            ]
                                .filter(Boolean)
                                .join(" | ")
                                .slice(0, 255),
                        },
                    });
                }
                await prismaClient_1.prisma.pos_sales.update({
                    where: { idPosSale: sale.idPosSale },
                    data: {
                        paymentLinkUrl: paymentLink,
                        checkoutLinkUrl: checkoutLink,
                        linkReferencia,
                        idLinkPago: linkRes.idLinkPago ?? null,
                    },
                });
                await prismaClient_1.prisma.pos_sale_events.create({
                    data: {
                        posSaleId: sale.idPosSale,
                        userId: cashierUserId,
                        eventType: "openpay_link_created",
                        payload: {
                            referencia: linkReferencia,
                            idLinkPago: linkRes.idLinkPago,
                            link: paymentLink,
                            checkoutLink,
                        },
                    },
                });
            }
            catch (linkError) {
                await prismaClient_1.prisma.pos_sale_events.create({
                    data: {
                        posSaleId: sale.idPosSale,
                        userId: cashierUserId,
                        eventType: "openpay_link_failed",
                        reason: linkError?.message || "Error generando link",
                    },
                });
                return res.status(201).json({
                    ok: true,
                    message: "Venta pendiente creada, pero falló la generación del link OpenPay. Revisa API_URL_PAGOS / pasarela.",
                    data: {
                        ...serializeSale((await prismaClient_1.prisma.pos_sales.findFirst({
                            where: { idPosSale: sale.idPosSale },
                            include: saleInclude,
                        }))),
                        paymentLink: null,
                        checkoutLink: null,
                        linkError: linkError?.message || "Error generando link",
                    },
                });
            }
        }
        const fresh = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: sale.idPosSale },
            include: saleInclude,
        });
        return res.status(201).json({
            ok: true,
            message: status === "pending_payment"
                ? "Venta pendiente: comparte el link OpenPay. El stock se descuenta al confirmar el pago."
                : "Venta POS completada",
            data: {
                ...serializeSale(fresh),
                paymentLink,
                checkoutLink,
                linkReferencia,
            },
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo completar la venta",
        });
    }
};
exports.createPosSale = createPosSale;
const listPosSales = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const branchId = req.query.branchId ? Number(req.query.branchId) : null;
        const status = req.query.status ? String(req.query.status) : null;
        const folio = req.query.folio ? String(req.query.folio).trim() : "";
        const from = req.query.from ? new Date(String(req.query.from)) : null;
        const to = req.query.to ? new Date(String(req.query.to)) : null;
        const where = {};
        if (branchId && Number.isSafeInteger(branchId))
            where.branchId = branchId;
        if (status && ["completed", "cancelled", "pending_payment"].includes(status)) {
            where.status = status;
        }
        if (folio)
            where.folio = { contains: folio };
        if (from || to) {
            where.createdAt = {};
            if (from && !Number.isNaN(from.getTime()))
                where.createdAt.gte = from;
            if (to && !Number.isNaN(to.getTime()))
                where.createdAt.lte = to;
        }
        const [total, rows] = await Promise.all([
            prismaClient_1.prisma.pos_sales.count({ where }),
            prismaClient_1.prisma.pos_sales.findMany({
                where,
                include: saleInclude,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        return res.json({
            ok: true,
            data: rows.map(serializeSale),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 0,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar ventas POS",
        });
    }
};
exports.listPosSales = listPosSales;
const getPosSaleById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: saleInclude,
        });
        if (!sale) {
            return res.status(404).json({ ok: false, message: "Venta no encontrada" });
        }
        return res.json({ ok: true, data: serializeSale(sale) });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al obtener la venta",
        });
    }
};
exports.getPosSaleById = getPosSaleById;
const cancelPosSale = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const id = Number(req.params.id);
        const reason = String(req.body?.reason || "").trim();
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        if (reason.length < 3) {
            return res.status(400).json({
                ok: false,
                message: "Indica un motivo de cancelación (mín. 3 caracteres)",
            });
        }
        const updated = await prismaClient_1.prisma.$transaction(async (tx) => {
            const sale = await tx.pos_sales.findFirst({
                where: { idPosSale: id },
                include: { items: true },
            });
            if (!sale)
                throw new Error("Venta no encontrada");
            if (sale.status === "cancelled") {
                throw new Error("Esta venta ya está cancelada");
            }
            if (sale.status === "completed") {
                await (0, posStock_service_1.restorePosStock)(tx, sale.items.map((it) => ({
                    productId: Number(it.productId),
                    quantity: Number(it.quantity),
                })), Number(sale.branchId), userId, sale.folio);
            }
            const row = await tx.pos_sales.update({
                where: { idPosSale: id },
                data: {
                    status: "cancelled",
                    cancelReason: reason.slice(0, 2000),
                    cancelledAt: new Date(),
                    cancelledByUserId: userId,
                    events: {
                        create: {
                            userId,
                            eventType: "cancelled",
                            reason: reason.slice(0, 2000),
                            payload: {
                                previousStatus: sale.status,
                            },
                        },
                    },
                },
                include: saleInclude,
            });
            return row;
        });
        return res.json({
            ok: true,
            message: "Venta cancelada. El inventario fue restaurado si aplica.",
            data: serializeSale(updated),
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo cancelar la venta",
        });
    }
};
exports.cancelPosSale = cancelPosSale;
/** Confirma pago de venta pending_payment (p.ej. OpenPay ya cobrado) y descuenta stock. */
const confirmPosPayment = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const updated = await prismaClient_1.prisma.$transaction(async (tx) => {
            const sale = await tx.pos_sales.findFirst({
                where: { idPosSale: id },
                include: { items: true },
            });
            if (!sale)
                throw new Error("Venta no encontrada");
            if (sale.status === "cancelled") {
                throw new Error("La venta está cancelada");
            }
            if (sale.status === "completed") {
                throw new Error("La venta ya está completada");
            }
            if (sale.status !== "pending_payment") {
                throw new Error("Solo se pueden confirmar ventas pendientes de pago");
            }
            await (0, posStock_service_1.decrementPosStock)(tx, sale.items.map((it) => ({
                productId: Number(it.productId),
                quantity: Number(it.quantity),
            })), Number(sale.branchId), userId, sale.folio);
            return tx.pos_sales.update({
                where: { idPosSale: id },
                data: {
                    status: "completed",
                    events: {
                        create: {
                            userId,
                            eventType: "payment_confirmed",
                            reason: String(req.body?.note || "").trim() || null,
                            payload: { previousStatus: sale.status },
                        },
                    },
                },
                include: saleInclude,
            });
        });
        return res.json({
            ok: true,
            message: "Pago confirmado. Inventario descontado.",
            data: serializeSale(updated),
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo confirmar el pago",
        });
    }
};
exports.confirmPosPayment = confirmPosPayment;
/** Regenera link OpenPay para una venta pending_payment. */
const retryPosPaymentLink = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: { items: true, payments: true, customer: true },
        });
        if (!sale) {
            return res.status(404).json({ ok: false, message: "Venta no encontrada" });
        }
        if (sale.status !== "pending_payment") {
            return res.status(400).json({
                ok: false,
                message: "Solo se puede regenerar link en ventas pendientes de pago",
            });
        }
        const hasOpenpay = sale.payments.some((p) => p.method === "openpay_link");
        if (!hasOpenpay) {
            return res.status(400).json({
                ok: false,
                message: "Esta venta no usa OpenPay link",
            });
        }
        const email = String(req.body?.email || sale.customerEmail || sale.customer?.email || "").trim();
        const phone = String(req.body?.phone || sale.customerPhone || sale.customer?.phone || "").trim();
        const name = String(sale.customerName || sale.customer?.name || "Cliente POS").trim();
        const lastname = sale.customer?.lastname || "";
        if (!email || !phone) {
            return res.status(400).json({
                ok: false,
                message: "Email y teléfono son requeridos para regenerar el link",
            });
        }
        const linkRes = await (0, pasarelaPagos_service_1.createLinkPayOnline)({
            name,
            lastname,
            email,
            phone,
            monto: Number(sale.total),
            products: sale.items.map((it) => ({
                idProduct: Number(it.productId),
                name: it.productName,
                price: Number(it.lineTotal) / Math.max(1, Number(it.quantity)),
                quantity: Number(it.quantity),
            })),
        });
        const updated = await prismaClient_1.prisma.pos_sales.update({
            where: { idPosSale: id },
            data: {
                customerEmail: email,
                customerPhone: phone,
                paymentLinkUrl: linkRes.link || null,
                checkoutLinkUrl: linkRes.checkoutLink || null,
                linkReferencia: linkRes.referencia || null,
                idLinkPago: linkRes.idLinkPago ?? null,
                events: {
                    create: {
                        userId,
                        eventType: "openpay_link_retry",
                        payload: {
                            referencia: linkRes.referencia,
                            idLinkPago: linkRes.idLinkPago,
                            link: linkRes.link,
                            checkoutLink: linkRes.checkoutLink,
                        },
                    },
                },
            },
            include: saleInclude,
        });
        const openPayPayment = updated.payments.find((p) => p.method === "openpay_link");
        if (openPayPayment) {
            await prismaClient_1.prisma.pos_payments.update({
                where: { idPosPayment: openPayPayment.idPosPayment },
                data: {
                    reference: [linkRes.referencia, linkRes.link, linkRes.checkoutLink]
                        .filter(Boolean)
                        .join(" | ")
                        .slice(0, 255),
                },
            });
        }
        return res.json({
            ok: true,
            message: "Link OpenPay regenerado",
            data: {
                ...serializeSale(await prismaClient_1.prisma.pos_sales.findFirst({
                    where: { idPosSale: id },
                    include: saleInclude,
                })),
                paymentLink: linkRes.link,
                checkoutLink: linkRes.checkoutLink,
                linkReferencia: linkRes.referencia,
            },
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo regenerar el link",
        });
    }
};
exports.retryPosPaymentLink = retryPosPaymentLink;
const getPosSaleTicket = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: saleInclude,
        });
        if (!sale) {
            return res.status(404).json({ ok: false, message: "Venta no encontrada" });
        }
        const data = serializeSale(sale);
        const formatMoney = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
        const methodLabel = {
            efectivo_sucursal: "Efectivo",
            tarjeta_sucursal: "Tarjeta",
            transferencia_bancaria: "Transferencia",
            openpay_link: "OpenPay (link)",
        };
        const itemsHtml = data.items
            .map((it) => `
      <tr>
        <td>${escapeHtml(it.productName)}${it.productSku ? `<br/><small>SKU: ${escapeHtml(it.productSku)}</small>` : ""}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td style="text-align:right">${formatMoney(it.unitPrice)}</td>
        <td style="text-align:right">${it.discountPct ? `${it.discountPct}%` : "—"}</td>
        <td style="text-align:right">${formatMoney(it.lineTotal)}</td>
      </tr>`)
            .join("");
        const paymentsHtml = data.payments
            .map((p) => `<div class="pay-line"><span>${methodLabel[p.method] || p.method}</span><strong>${formatMoney(p.amount)}</strong></div>`)
            .join("");
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ticket ${escapeHtml(data.folio)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f3f4f6; padding: 24px; }
    .ticket { max-width: 420px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px 20px; }
    h1 { font-size: 20px; text-align: center; color: #bb3d4b; margin-bottom: 4px; }
    .muted { color: #6b7280; font-size: 12px; text-align: center; margin-bottom: 16px; }
    .meta { font-size: 13px; margin-bottom: 14px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
    th { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; color: #6b7280; font-weight: 600; }
    td { padding: 8px 4px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .totals { margin-top: 12px; font-size: 13px; }
    .totals .row { display: flex; justify-content: space-between; margin: 4px 0; }
    .totals .grand { font-size: 18px; font-weight: 700; margin-top: 8px; padding-top: 8px; border-top: 2px dashed #e5e7eb; }
    .pay-line { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
    .actions { margin-top: 18px; display: flex; gap: 8px; justify-content: center; }
    button { border: 0; background: #bb3d4b; color: #fff; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #ecfdf5; color: #166534; }
    .status.cancelled { background: #fef2f2; color: #991b1b; }
    .status.pending_payment { background: #fffbeb; color: #92400e; }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .ticket { border: 0; box-shadow: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <h1>PCinBOX</h1>
    <p class="muted">Ticket de Punto de Venta</p>
    <div class="meta">
      <div><strong>Folio:</strong> ${escapeHtml(data.folio)}
        <span class="status ${escapeHtml(data.status)}">${escapeHtml(data.status)}</span>
      </div>
      <div><strong>Fecha:</strong> ${new Date(data.createdAt).toLocaleString("es-MX")}</div>
      <div><strong>Sucursal:</strong> ${escapeHtml([data.branchName, data.branchCity].filter(Boolean).join(" — ") || String(data.branchId))}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(data.customerName || "Público general")}</div>
      <div><strong>Vendedor:</strong> ${escapeHtml(data.cashierName || "—")}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th style="text-align:center">Cant</th>
          <th style="text-align:right">P.U.</th>
          <th style="text-align:right">Desc.</th>
          <th style="text-align:right">Importe</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatMoney(data.subtotal)}</span></div>
      <div class="row"><span>Descuentos</span><span>-${formatMoney(data.discountTotal)}</span></div>
      <div class="row grand"><span>TOTAL</span><span>${formatMoney(data.total)}</span></div>
    </div>
    <div style="margin-top:14px">
      <strong style="font-size:13px">Formas de pago</strong>
      ${paymentsHtml}
    </div>
    ${data.cancelReason ? `<p class="muted" style="margin-top:12px;text-align:left">Cancelación: ${escapeHtml(data.cancelReason)}</p>` : ""}
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </div>
</body>
</html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(html);
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al generar ticket",
        });
    }
};
exports.getPosSaleTicket = getPosSaleTicket;
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
//# sourceMappingURL=pos.controller.js.map