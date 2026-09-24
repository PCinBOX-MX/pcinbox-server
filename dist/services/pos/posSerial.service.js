"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeSerial = serializeSerial;
exports.normalizeItemSerials = normalizeItemSerials;
exports.assertSerialsAvailable = assertSerialsAvailable;
exports.assignSerialsOnSale = assignSerialsOnSale;
exports.releaseSerialsOnCancel = releaseSerialsOnCancel;
exports.searchSerials = searchSerials;
exports.getSerialByNumber = getSerialByNumber;
exports.markSerialRma = markSerialRma;
exports.registerAvailableSerial = registerAvailableSerial;
const prismaClient_1 = require("../../db/prismaClient");
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}
function serializeSerial(row) {
    return {
        idProductSerial: Number(row.idProductSerial),
        productId: Number(row.productId),
        productName: row.products?.name || null,
        productSku: row.products?.sku || null,
        serialNumber: row.serialNumber,
        branchId: row.branchId != null ? Number(row.branchId) : null,
        branchName: row.branches?.name || null,
        status: row.status,
        posSaleId: row.posSaleId != null ? Number(row.posSaleId) : null,
        posSaleItemId: row.posSaleItemId != null ? Number(row.posSaleItemId) : null,
        folio: row.pos_sales?.folio || null,
        customerUserId: row.customerUserId != null ? Number(row.customerUserId) : null,
        customerName: row.customerName || null,
        soldAt: row.soldAt,
        warrantyMonths: row.warrantyMonths,
        warrantyMode: row.warrantyMode ?? null,
        warrantyExpiresAt: row.warrantyExpiresAt,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
const serialInclude = {
    products: { select: { name: true, sku: true } },
    branches: { select: { name: true, city: true } },
    pos_sales: { select: { folio: true, status: true, createdAt: true } },
};
/** Valida y normaliza series por línea de venta. */
function normalizeItemSerials(quantity, requiresSerial, rawSerials, productLabel) {
    const list = Array.isArray(rawSerials)
        ? rawSerials.map((s) => String(s || "").trim()).filter(Boolean)
        : [];
    if (requiresSerial) {
        if (list.length !== quantity) {
            throw new Error(`${productLabel}: requiere ${quantity} número(s) de serie`);
        }
    }
    if (list.length > 0 && list.length !== quantity) {
        throw new Error(`${productLabel}: debes capturar exactamente ${quantity} serie(s) o ninguna`);
    }
    const unique = new Set(list.map((s) => s.toUpperCase()));
    if (unique.size !== list.length) {
        throw new Error(`${productLabel}: hay números de serie duplicados`);
    }
    return list;
}
async function assertSerialsAvailable(tx, serials) {
    if (serials.length === 0)
        return;
    const existing = await tx.product_serials.findMany({
        where: {
            serialNumber: { in: serials },
        },
        select: { serialNumber: true, status: true },
    });
    for (const row of existing) {
        if (row.status === "sold" || row.status === "rma") {
            throw new Error(`La serie ${row.serialNumber} ya está registrada como ${row.status}`);
        }
    }
}
async function assignSerialsOnSale(tx, params) {
    if (params.serials.length === 0)
        return;
    const soldAt = params.soldAt || new Date();
    const months = params.warrantyMonths != null && params.warrantyMonths > 0
        ? params.warrantyMonths
        : null;
    const warrantyMode = params.warrantyMode === "none" ||
        params.warrantyMode === "service_center" ||
        params.warrantyMode === "months"
        ? params.warrantyMode
        : months != null
            ? "months"
            : null;
    const warrantyExpiresAt = months != null ? addMonths(soldAt, months) : null;
    for (const serialNumber of params.serials) {
        const existing = await tx.product_serials.findFirst({
            where: { serialNumber },
        });
        if (existing) {
            if (Number(existing.productId) !== params.productId) {
                throw new Error(`La serie ${serialNumber} pertenece a otro producto`);
            }
            const claimed = await tx.product_serials.updateMany({
                where: {
                    idProductSerial: existing.idProductSerial,
                    status: { in: ["available", "returned"] },
                },
                data: {
                    status: "sold",
                    branchId: params.branchId,
                    posSaleId: params.posSaleId,
                    posSaleItemId: params.posSaleItemId,
                    customerUserId: params.customerUserId,
                    customerName: params.customerName,
                    soldAt,
                    warrantyMonths: months,
                    warrantyMode,
                    warrantyExpiresAt,
                },
            });
            if (claimed.count === 0) {
                throw new Error(`La serie ${serialNumber} no está disponible`);
            }
        }
        else {
            await tx.product_serials.create({
                data: {
                    productId: params.productId,
                    serialNumber,
                    branchId: params.branchId,
                    status: "sold",
                    posSaleId: params.posSaleId,
                    posSaleItemId: params.posSaleItemId,
                    customerUserId: params.customerUserId,
                    customerName: params.customerName,
                    soldAt,
                    warrantyMonths: months,
                    warrantyMode,
                    warrantyExpiresAt,
                },
            });
        }
    }
}
async function releaseSerialsOnCancel(tx, posSaleId) {
    await tx.product_serials.updateMany({
        where: { posSaleId, status: "sold" },
        data: {
            status: "returned",
            notes: "Devuelto por cancelación de venta POS",
        },
    });
}
async function searchSerials(q, limit = 20) {
    const term = String(q || "").trim();
    if (term.length < 2)
        return [];
    const or = [];
    // Serial completo → índice unique; parcial → prefijo (mejor que LIKE %x%).
    if (term.length >= 8 && !/\s/.test(term)) {
        or.push({ serialNumber: { equals: term } });
    }
    or.push({ serialNumber: { startsWith: term } });
    if (term.length >= 3) {
        or.push({ customerName: { startsWith: term } });
    }
    const rows = await prismaClient_1.prisma.product_serials.findMany({
        where: { OR: or },
        include: serialInclude,
        take: Math.min(Math.max(limit, 1), 50),
        orderBy: { updatedAt: "desc" },
    });
    return rows.map(serializeSerial);
}
async function getSerialByNumber(serialNumber) {
    const sn = String(serialNumber || "").trim();
    if (!sn)
        return null;
    const row = await prismaClient_1.prisma.product_serials.findFirst({
        where: { serialNumber: sn },
        include: serialInclude,
    });
    return row ? serializeSerial(row) : null;
}
async function markSerialRma(params) {
    const sn = String(params.serialNumber || "").trim();
    const row = await prismaClient_1.prisma.product_serials.findFirst({
        where: { serialNumber: sn },
    });
    if (!row)
        throw new Error("Serie no encontrada");
    if (row.status !== "sold" && row.status !== "rma") {
        throw new Error("Solo se puede marcar RMA en series vendidas");
    }
    const updated = await prismaClient_1.prisma.product_serials.update({
        where: { idProductSerial: row.idProductSerial },
        data: {
            status: "rma",
            notes: params.notes
                ? String(params.notes).slice(0, 500)
                : row.notes,
        },
        include: serialInclude,
    });
    return serializeSerial(updated);
}
async function registerAvailableSerial(params) {
    const serialNumber = String(params.serialNumber || "").trim();
    if (!serialNumber)
        throw new Error("Número de serie requerido");
    if (!Number.isSafeInteger(params.productId) || params.productId <= 0) {
        throw new Error("Producto inválido");
    }
    const product = await prismaClient_1.prisma.products.findFirst({
        where: { idProduct: params.productId, active: 1 },
        select: { idProduct: true },
    });
    if (!product)
        throw new Error("Producto no encontrado");
    const created = await prismaClient_1.prisma.product_serials.create({
        data: {
            productId: params.productId,
            serialNumber,
            branchId: params.branchId || null,
            status: "available",
            notes: params.notes ? String(params.notes).slice(0, 500) : null,
        },
        include: serialInclude,
    });
    return serializeSerial(created);
}
//# sourceMappingURL=posSerial.service.js.map