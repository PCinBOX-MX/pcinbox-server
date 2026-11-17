"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POS_ONLINE_PAYMENT_FEE_RATE = exports.POS_COST_PROVIDER_IDS = void 0;
exports.isPosCostProvider = isPosCostProvider;
exports.loadPosCostProviderProductIds = loadPosCostProviderProductIds;
exports.loadPosUnitCostsByProductIds = loadPosUnitCostsByProductIds;
exports.summarizePosCosts = summarizePosCosts;
const prismaClient_1 = require("../../db/prismaClient");
/** Proveedores con precio de compra + margen en `products_providers` (TechSmart, DicoTech). */
exports.POS_COST_PROVIDER_IDS = [2, 3];
/** IVA que se suma al precio de proveedor para el costo de inversión. */
const POS_COST_IVA_FACTOR = 1.16;
/** Comisión de pagos en línea, sobre el importe cobrado de proveedores 2 y 3. */
exports.POS_ONLINE_PAYMENT_FEE_RATE = 0.03;
function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
function isPosCostProvider(providerId) {
    return exports.POS_COST_PROVIDER_IDS.includes(Number(providerId));
}
/** Ids pedidos que son TechSmart o DicoTech, tengan o no fila de costo. */
async function loadPosCostProviderProductIds(productIds) {
    const ids = [
        ...new Set(productIds
            .map((id) => Number(id))
            .filter((id) => Number.isSafeInteger(id) && id > 0)),
    ];
    if (ids.length === 0)
        return new Set();
    const rows = await prismaClient_1.prisma.products.findMany({
        where: {
            idProduct: { in: ids },
            providerId: { in: [...exports.POS_COST_PROVIDER_IDS] },
        },
        select: { idProduct: true },
    });
    return new Set(rows.map((row) => Number(row.idProduct)));
}
/** Costos actuales por idProduct (solo proveedores 2/3 con fila en products_providers). */
async function loadPosUnitCostsByProductIds(productIds) {
    const ids = [
        ...new Set(productIds
            .map((id) => Number(id))
            .filter((id) => Number.isSafeInteger(id) && id > 0)),
    ];
    const out = new Map();
    if (ids.length === 0)
        return out;
    const products = await prismaClient_1.prisma.products.findMany({
        where: {
            idProduct: { in: ids },
            providerId: { in: [...exports.POS_COST_PROVIDER_IDS] },
            idProductExt: { not: null },
        },
        select: { idProduct: true, idProductExt: true, providerId: true, price: true },
    });
    if (products.length === 0)
        return out;
    const providerRows = await prismaClient_1.prisma.products_providers.findMany({
        where: {
            idProductExt: {
                in: [...new Set(products.map((p) => String(p.idProductExt)))],
            },
            providerId: { in: [...exports.POS_COST_PROVIDER_IDS] },
        },
        select: {
            idProductExt: true,
            providerId: true,
            price: true,
            profitMargin: true,
        },
    });
    const byExt = new Map(providerRows.map((r) => [`${Number(r.providerId)}|${r.idProductExt}`, r]));
    for (const p of products) {
        const row = byExt.get(`${Number(p.providerId)}|${p.idProductExt}`);
        if (!row || row.price == null)
            continue;
        out.set(Number(p.idProduct), {
            costUnit: roundMoney((Number(row.price) || 0) * POS_COST_IVA_FACTOR),
            profitMarginUnit: roundMoney(Number(row.profitMargin ?? 0) || 0),
            catalogPriceUnit: roundMoney(Number(p.price) || 0),
        });
    }
    return out;
}
function summarizePosCosts(lines) {
    let count = 0;
    let units = 0;
    let investment = 0;
    let totalCost = 0;
    for (const line of lines) {
        if (line.costUnit == null)
            continue;
        const qty = Number(line.quantity) || 0;
        count += 1;
        units += qty;
        investment += Number(line.costUnit) * qty;
        totalCost += Number(line.lineTotal) || 0;
    }
    if (count === 0)
        return null;
    const roundedInvestment = roundMoney(investment);
    const roundedTotal = roundMoney(totalCost);
    const commission = roundMoney(roundedTotal * exports.POS_ONLINE_PAYMENT_FEE_RATE);
    return {
        lines: count,
        units,
        investment: roundedInvestment,
        profitMargin: roundMoney(roundedTotal - commission - roundedInvestment),
        totalCost: roundedTotal,
    };
}
//# sourceMappingURL=posCost.service.js.map