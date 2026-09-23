"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SELLER_MAX_DISCOUNT_PCT = void 0;
exports.roundMoney = roundMoney;
exports.computeLineTotal = computeLineTotal;
exports.assertDiscountAllowed = assertDiscountAllowed;
exports.nextPosFolio = nextPosFolio;
exports.searchPosProducts = searchPosProducts;
const prismaClient_1 = require("../../db/prismaClient");
const SELLER_MAX_DISCOUNT_PCT = 3;
exports.SELLER_MAX_DISCOUNT_PCT = SELLER_MAX_DISCOUNT_PCT;
function roundMoney(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function computeLineTotal(unitPrice, quantity, discountPct) {
    const base = unitPrice * quantity;
    const discounted = base * (1 - discountPct / 100);
    return roundMoney(discounted);
}
function assertDiscountAllowed(discountPct, isAdmin) {
    if (discountPct < 0 || discountPct > 100) {
        throw new Error("El descuento debe estar entre 0 y 100%");
    }
    if (!isAdmin && discountPct > SELLER_MAX_DISCOUNT_PCT) {
        throw new Error(`Descuento máximo permitido para vendedor: ${SELLER_MAX_DISCOUNT_PCT}%`);
    }
}
async function nextPosFolio(tx) {
    const last = await tx.pos_sales.findFirst({
        orderBy: { idPosSale: "desc" },
        select: { idPosSale: true },
    });
    const next = Number(last?.idPosSale ?? 0) + 1;
    return `PV-${String(next).padStart(7, "0")}`;
}
async function searchPosProducts(q, branchId, limit = 25) {
    const term = String(q || "").trim();
    if (term.length < 1)
        return [];
    const like = `%${term}%`;
    const products = await prismaClient_1.prisma.products.findMany({
        where: {
            active: 1,
            OR: [
                { name: { contains: term } },
                { sku: { contains: term } },
                { upc: { contains: term } },
                { idProductExt: { contains: term } },
            ],
        },
        take: Math.min(Math.max(limit, 1), 50),
        orderBy: { name: "asc" },
        select: {
            idProduct: true,
            idProductExt: true,
            name: true,
            price: true,
            stock: true,
            sku: true,
            upc: true,
            image_url: true,
            marca: { select: { name: true } },
            product_stock: {
                where: { branchId },
                select: { stock: true, branchId: true },
                take: 1,
            },
        },
    });
    // Prefer exact SKU/UPC/part matches first
    const scored = products
        .map((p) => {
        const sku = (p.sku || "").toLowerCase();
        const upc = (p.upc || "").toLowerCase();
        const ext = (p.idProductExt || "").toLowerCase();
        const name = (p.name || "").toLowerCase();
        const t = term.toLowerCase();
        let score = 0;
        if (sku === t || upc === t || ext === t)
            score += 100;
        else if (sku.startsWith(t) || upc.startsWith(t) || ext.startsWith(t))
            score += 60;
        else if (name.startsWith(t))
            score += 40;
        else if (name.includes(t) || sku.includes(t) || upc.includes(t))
            score += 20;
        const branchStock = p.product_stock[0]?.stock ?? 0;
        return {
            idProduct: Number(p.idProduct),
            idProductExt: p.idProductExt,
            name: p.name,
            price: Number(p.price),
            stockGlobal: Number(p.stock),
            stockBranch: Number(branchStock),
            sku: p.sku,
            upc: p.upc,
            marca: p.marca?.name || null,
            image_url: p.image_url,
            score,
        };
    })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    // silence unused like (MySQL contains uses prisma)
    void like;
    return scored;
}
//# sourceMappingURL=pos.service.js.map