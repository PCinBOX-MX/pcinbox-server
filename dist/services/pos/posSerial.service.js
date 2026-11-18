"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeSerial = serializeSerial;
exports.serialKey = serialKey;
exports.serialMatchesProductCode = serialMatchesProductCode;
exports.isSharedBarcodeSerial = isSharedBarcodeSerial;
exports.serialIsSharedBarcode = serialIsSharedBarcode;
exports.loadSharedBarcodeKeys = loadSharedBarcodeKeys;
exports.readSharedSerialGroups = readSharedSerialGroups;
exports.mergeSharedBarcodeSerials = mergeSharedBarcodeSerials;
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
/** Misma clave para comparar una serie contra un UPC (espacios y guiones no cuentan). */
function serialKey(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
}
function serialMatchesProductCode(serial, code) {
    const left = serialKey(serial);
    const right = serialKey(code);
    return Boolean(left) && left === right;
}
function isSharedBarcodeSerial(serial, codes) {
    return codes.some((code) => serialMatchesProductCode(serial, code));
}
/** La serie es el UPC de esta línea o el UPC de algún producto del catálogo. */
function serialIsSharedBarcode(serial, productUpc, catalogKeys) {
    return (isSharedBarcodeSerial(serial, [productUpc]) ||
        catalogKeys.has(serialKey(serial)));
}
async function loadSharedBarcodeKeys(tx, serials) {
    const list = [
        ...new Set(serials.map((serial) => String(serial || "").trim()).filter(Boolean)),
    ];
    if (list.length === 0)
        return new Set();
    const rows = await tx.products.findMany({
        where: { upc: { in: list } },
        select: { upc: true },
    });
    const keys = new Set();
    for (const serial of list) {
        if (rows.some((row) => serialMatchesProductCode(serial, row.upc))) {
            keys.add(serialKey(serial));
        }
    }
    return keys;
}
function readSharedSerialGroups(events) {
    const created = (events || []).find((event) => event.eventType === "created");
    const payload = created?.payload;
    if (!payload || !Array.isArray(payload.sharedSerials))
        return [];
    const groups = [];
    for (const raw of payload.sharedSerials) {
        if (!raw || typeof raw !== "object")
            continue;
        const group = raw;
        const serials = Array.isArray(group.serials)
            ? group.serials.map((serial) => String(serial || "").trim()).filter(Boolean)
            : [];
        if (!serials.length || !Number.isFinite(Number(group.productId)))
            continue;
        groups.push({
            productId: Number(group.productId),
            productName: String(group.productName || ""),
            serials,
            warrantyMonths: group.warrantyMonths != null && Number.isFinite(Number(group.warrantyMonths))
                ? Number(group.warrantyMonths)
                : null,
            warrantyMode: typeof group.warrantyMode === "string" ? group.warrantyMode : null,
        });
    }
    return groups;
}
/** Agrega al ticket y a la garantía las series que son UPC y no viven en product_serials. */
function mergeSharedBarcodeSerials(items, groups) {
    if (!groups.length)
        return items;
    const queues = new Map();
    for (const group of groups) {
        const key = `${group.productId}|${group.productName}`;
        const queue = queues.get(key) || [];
        queue.push(group);
        queues.set(key, queue);
    }
    let syntheticId = -1;
    return items.map((item) => {
        const key = `${Number(item.productId)}|${item.productName || ""}`;
        const group = queues.get(key)?.shift();
        if (!group)
            return item;
        const extra = group.serials.map((serialNumber) => ({
            idProductSerial: syntheticId--,
            serialNumber,
            status: "sold",
            warrantyMonths: group.warrantyMonths,
            warrantyMode: group.warrantyMode,
            warrantyExpiresAt: null,
        }));
        return { ...item, serials: [...(item.serials || []), ...extra] };
    });
}
/** Valida y normaliza series por línea de venta. */
function normalizeItemSerials(quantity, requiresSerial, rawSerials, productLabel, productCodes = []) {
    const list = Array.isArray(rawSerials)
        ? rawSerials.map((s) => String(s || "").trim()).filter(Boolean)
        : [];
    if (requiresSerial) {
        if (list.length !== quantity) {
            throw new Error(`${productLabel}: faltan series. Captura ${quantity} número(s), uno por cada pieza, y vuelve a cobrar. Si el campo no aparece, quita el folio, impórtalo de nuevo y, si sigue igual, reporta a soporte el folio y el nombre del producto.`);
        }
    }
    if (list.length > 0 && list.length !== quantity) {
        throw new Error(`${productLabel}: hay ${list.length} serie(s) para ${quantity} pieza(s). Captura una serie por pieza, o déjalas todas vacías si el producto no exige serie.`);
    }
    const counts = new Map();
    for (const serial of list) {
        const key = serialKey(serial);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const serial of list) {
        if ((counts.get(serialKey(serial)) || 0) < 2)
            continue;
        if (isSharedBarcodeSerial(serial, productCodes))
            continue;
        throw new Error(`${productLabel}: hay series repetidas. Cada pieza necesita una serie distinta. Corrige los campos y vuelve a cobrar.`);
    }
    return list;
}
async function assertSerialsAvailable(tx, serials, productCodes = []) {
    if (serials.length === 0)
        return;
    const catalogKeys = await loadSharedBarcodeKeys(tx, serials);
    const trackable = serials.filter((serial) => !serialIsSharedBarcode(serial, null, catalogKeys) &&
        !isSharedBarcodeSerial(serial, productCodes));
    if (trackable.length === 0)
        return;
    const existing = await tx.product_serials.findMany({
        where: {
            serialNumber: { in: trackable },
        },
        select: { serialNumber: true, status: true },
    });
    for (const row of existing) {
        if (row.status === "sold" || row.status === "rma") {
            throw new Error(`La serie ${row.serialNumber} ya está registrada como ${row.status === "sold" ? "vendida" : "RMA"}. Usa otra serie. Si crees que es un error, reporta a soporte esa serie y el folio de la venta.`);
        }
    }
}
async function assignSerialsOnSale(tx, params) {
    if (params.serials.length === 0)
        return;
    const catalogKeys = await loadSharedBarcodeKeys(tx, params.serials);
    const serials = params.serials.filter((serial) => !serialIsSharedBarcode(serial, params.productUpc, catalogKeys));
    if (serials.length === 0)
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
    for (const serialNumber of serials) {
        const existing = await tx.product_serials.findFirst({
            where: { serialNumber },
        });
        if (existing) {
            if (Number(existing.productId) !== params.productId) {
                throw new Error(`La serie ${serialNumber} pertenece a otro producto`);
            }
            const claimable = params.allowAlreadySold
                ? ["available", "returned", "sold", "rma"]
                : ["available", "returned"];
            const claimed = await tx.product_serials.updateMany({
                where: {
                    idProductSerial: existing.idProductSerial,
                    status: { in: claimable },
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
        throw new Error("No se pudo registrar la serie porque el producto no tiene un identificador válido. Si la línea viene de un folio, quita el folio e impórtalo de nuevo. Si se repite, reporta a soporte el folio y el nombre del producto.");
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