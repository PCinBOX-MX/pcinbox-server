"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductSerialFlags = exports.SELLER_MAX_DISCOUNT_PCT = void 0;
exports.roundMoney = roundMoney;
exports.computeLineTotal = computeLineTotal;
exports.assertDiscountAllowed = assertDiscountAllowed;
exports.nextPosFolio = nextPosFolio;
exports.searchPosProducts = searchPosProducts;
exports.invalidatePosSearchCatalog = invalidatePosSearchCatalog;
exports.hydratePosProductsByIds = hydratePosProductsByIds;
const prismaClient_1 = require("../../db/prismaClient");
const pcinbox_branch_display_1 = require("../../constants/pcinbox-branch-display");
const searchNormalization_1 = require("../../utils/searchNormalization");
const posSerialFlags_service_1 = require("./posSerialFlags.service");
Object.defineProperty(exports, "getProductSerialFlags", { enumerable: true, get: function () { return posSerialFlags_service_1.getProductSerialFlags; } });
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
    const rows = await tx.$queryRaw `
    SELECT next_val FROM pos_folio_seq WHERE id = 1 FOR UPDATE
  `;
    let next = Number(rows[0]?.next_val);
    if (!Number.isSafeInteger(next) || next <= 0) {
        const last = await tx.pos_sales.findFirst({
            orderBy: { idPosSale: "desc" },
            select: { idPosSale: true },
        });
        next = Number(last?.idPosSale ?? 0) + 1;
        await tx.$executeRaw `
      INSERT INTO pos_folio_seq (id, next_val) VALUES (1, ${next + 1})
      ON DUPLICATE KEY UPDATE next_val = ${next + 1}
    `;
    }
    else {
        await tx.$executeRaw `
      UPDATE pos_folio_seq SET next_val = ${next + 1} WHERE id = 1
    `;
    }
    return String(next);
}
/** Bodegas POS por proveedor (mismas reglas que pcinbox-client). */
function buildPosStocksByBranch(params) {
    const { providerId, providerName, providerBranchList, stockMap } = params;
    const stocksByBranch = providerBranchList
        .filter((b) => (0, pcinbox_branch_display_1.isPosSellableBranchName)(providerId, b.name))
        .map((b) => {
        const id = Number(b.idBranche);
        const display = (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(b.name) ||
            [b.name, b.city].filter(Boolean).join(" — ") ||
            `Bodega ${id}`;
        return {
            branchId: id,
            name: b.name,
            city: b.city,
            providerId: Number(b.providerId),
            providerName,
            stock: stockMap.get(id) ?? 0,
            // Label limpio (como client): sin concatenar proveedor.
            label: display,
        };
    });
    // Provider 1 sin fila de bodega: stock global (sin selector de bodegas).
    if (providerId === 1 && stocksByBranch.length === 0) {
        return [];
    }
    stocksByBranch.sort((a, b) => b.stock - a.stock || a.label.localeCompare(b.label));
    return stocksByBranch;
}
/** Variantes simples para LIKE sin acentos (a↔á, e↔é…). */
function accentVariants(token) {
    const map = {
        a: "[aáàäâ]",
        e: "[eéèëê]",
        i: "[iíìïî]",
        o: "[oóòöô]",
        u: "[uúùüû]",
        n: "[nñ]",
    };
    // Para Prisma `contains` no hay regex; devolvemos token plano + sin acentos
    const plain = (0, searchNormalization_1.normalizeMatchText)(token);
    const set = new Set([token, plain].filter((t) => t.length > 0));
    return [...set];
}
function scorePosProduct(product, query, tokens) {
    let score = 0;
    const q = (0, searchNormalization_1.normalizeMatchText)(query);
    const name = (0, searchNormalization_1.normalizeMatchText)(product.name);
    const sku = (0, searchNormalization_1.normalizeMatchText)(product.sku);
    const upc = (0, searchNormalization_1.normalizeMatchText)(product.upc);
    const description = (0, searchNormalization_1.normalizeMatchText)(product.description);
    const marcaName = (0, searchNormalization_1.normalizeMatchText)(product.marcaName);
    const categoryName = (0, searchNormalization_1.normalizeMatchText)(product.categoryName);
    const idExt = (0, searchNormalization_1.normalizeMatchText)(product.idProductExt);
    if (sku === q || upc === q || idExt === q)
        score += 200;
    if (name === q)
        score += 150;
    if (name.startsWith(q))
        score += 80;
    if (sku.includes(q) || upc.includes(q) || idExt.includes(q))
        score += 70;
    if (marcaName.includes(q))
        score += 40;
    if (categoryName.includes(q))
        score += 35;
    if (description.includes(q))
        score += 15;
    for (const rawToken of tokens) {
        const token = (0, searchNormalization_1.normalizeMatchText)(rawToken);
        if (token.length < 1)
            continue;
        if (name.includes(token))
            score += 30;
        if (marcaName.includes(token))
            score += 20;
        if (categoryName.includes(token))
            score += 18;
        if (sku.includes(token) || upc.includes(token) || idExt.includes(token))
            score += 35;
        if (description.includes(token))
            score += 8;
    }
    return score;
}
/** Frases/sinónimos útiles para SQL (además del término ya normalizado). */
function sqlPhraseHints(raw, normalized) {
    const hints = new Set();
    const push = (s) => {
        const t = s.trim();
        if (t.length >= 2)
            hints.add(t);
    };
    push(raw);
    push(normalized);
    // Si la normalización cambió el texto (ej. "tarjeta madre" → "motherboard"),
    // también buscamos la frase original y variantes frecuentes en catálogo ES.
    if ((0, searchNormalization_1.normalizeMatchText)(raw) !== (0, searchNormalization_1.normalizeMatchText)(normalized)) {
        push(raw);
    }
    if (normalized === "motherboard" || /tarjeta\s+madre/i.test(raw)) {
        push("tarjeta madre");
        push("motherboard");
        push("placa base");
        push("mobo");
    }
    return [...hints].slice(0, 6);
}
/**
 * Búsqueda POS rápida: WHERE liviano (sin description/joins),
 * stock en una 2ª consulta, score en memoria.
 */
async function searchPosProducts(q, limit = 25) {
    const raw = String(q || "").trim();
    if (!raw)
        return [];
    if (raw.length < 2 && !/^\d{8,}$/.test(raw))
        return [];
    const normalizedQuery = (0, searchNormalization_1.normalizeSearchTerm)(raw) || (0, searchNormalization_1.normalizeMatchText)(raw);
    const rawTokens = (0, searchNormalization_1.normalizeMatchText)(raw)
        .split(/\s+/)
        .filter((t) => t.length >= 2);
    const tokens = normalizedQuery.split(/\s+/).filter((t) => t.length >= 1);
    const phrases = sqlPhraseHints(raw, normalizedQuery);
    const termBag = [
        ...new Set([...phrases, ...tokens.flatMap(accentVariants), ...rawTokens].filter((t) => t.length >= 2 || /^\d+$/.test(t))),
    ].slice(0, 6);
    const or = [];
    // Siempre permitir buscar por idProductExt (clave externa / número de parte)
    if (raw.length >= 2) {
        or.push({ idProductExt: { equals: raw } }, { idProductExt: { startsWith: raw } });
    }
    // Código de barras / SKU: exacto + prefijo (aprovecha índices B-tree)
    if (/^\d{6,}$/.test(raw) || /^[A-Za-z0-9\-_.]{4,}$/.test(raw)) {
        or.push({ sku: { equals: raw } }, { upc: { equals: raw } }, { sku: { startsWith: raw } }, { upc: { startsWith: raw } });
    }
    for (const term of termBag) {
        // Nombre sigue con contains (texto libre); códigos con prefijo.
        or.push({ name: { contains: term } }, { sku: { startsWith: term } }, { upc: { startsWith: term } }, { idProductExt: { startsWith: term } });
    }
    // Multi-palabra en español: AND de tokens originales sobre name
    // (evita depender solo de "motherboard" cuando el catálogo dice "Tarjeta Madre").
    if (rawTokens.length >= 2) {
        or.push({
            AND: rawTokens.map((t) => ({ name: { contains: t } })),
        });
    }
    if (or.length === 0)
        return [];
    const hasSerialCols = await (0, posSerialFlags_service_1.productsHaveSerialColumns)();
    const takeCandidates = Math.min(Math.max(limit * 3, 30), 60);
    const lightSelect = {
        idProduct: true,
        idProductExt: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        sku: true,
        upc: true,
        image_url: true,
        providerId: true,
        isPC: true,
        marca: { select: { name: true } },
        categories: { select: { name: true } },
        providers: { select: { companyName: true } },
    };
    const products = hasSerialCols
        ? await prismaClient_1.prisma.products.findMany({
            where: { active: 1, OR: or },
            take: takeCandidates,
            select: {
                ...lightSelect,
                requiresSerial: true,
                warrantyMonths: true,
                warrantyMode: true,
            },
        })
        : await prismaClient_1.prisma.products.findMany({
            where: { active: 1, OR: or },
            take: takeCandidates,
            select: lightSelect,
        });
    // Scoring: tokens originales + normalizados (para "tarjeta madre" y "motherboard")
    const scoreTokens = [
        ...new Set([...rawTokens, ...tokens].filter((t) => t.length >= 1)),
    ];
    const ranked = products
        .map((p) => {
        const row = {
            name: p.name,
            sku: p.sku,
            upc: p.upc,
            description: p.description ?? null,
            idProductExt: p.idProductExt,
            marcaName: p.marca?.name ?? null,
            categoryName: p.categories?.name ?? null,
        };
        const scoreRaw = scorePosProduct(row, (0, searchNormalization_1.normalizeMatchText)(raw), rawTokens);
        const scoreNorm = scorePosProduct(row, normalizedQuery, scoreTokens);
        return { p, score: Math.max(scoreRaw, scoreNorm) };
    })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score ||
        String(a.p.name || "").localeCompare(String(b.p.name || "")))
        .slice(0, Math.min(Math.max(limit, 1), 40));
    if (ranked.length === 0)
        return [];
    const productIds = ranked.map((r) => Number(r.p.idProduct));
    const providerIds = [
        ...new Set(ranked.map((r) => Number(r.p.providerId)).filter((id) => id > 0)),
    ];
    const [stockRows, providerBranches] = await Promise.all([
        prismaClient_1.prisma.product_stock.findMany({
            where: { productId: { in: productIds } },
            select: {
                productId: true,
                branchId: true,
                stock: true,
            },
        }),
        providerIds.length > 0
            ? prismaClient_1.prisma.branches.findMany({
                where: { providerId: { in: providerIds } },
                select: {
                    idBranche: true,
                    name: true,
                    city: true,
                    providerId: true,
                    providers: { select: { companyName: true } },
                },
            })
            : Promise.resolve([]),
    ]);
    const stockByProduct = new Map();
    for (const row of stockRows) {
        const pid = Number(row.productId);
        const bid = Number(row.branchId);
        let m = stockByProduct.get(pid);
        if (!m) {
            m = new Map();
            stockByProduct.set(pid, m);
        }
        m.set(bid, Number(row.stock ?? 0));
    }
    const branchesByProvider = new Map();
    for (const b of providerBranches) {
        const pid = Number(b.providerId);
        const list = branchesByProvider.get(pid) || [];
        list.push(b);
        branchesByProvider.set(pid, list);
    }
    return ranked.map(({ p, score }) => {
        const providerId = Number(p.providerId);
        const providerName = p.providers?.companyName?.trim() || null;
        const stockMap = stockByProduct.get(Number(p.idProduct)) || new Map();
        const providerBranchList = branchesByProvider.get(providerId) || [];
        const stocksByBranch = buildPosStocksByBranch({
            providerId,
            providerName,
            providerBranchList,
            stockMap,
        });
        const preferred = stocksByBranch.find((s) => s.stock > 0) || stocksByBranch[0] || null;
        // Existencia real desde DB para los 3 proveedores.
        const inStock = stocksByBranch.length > 0
            ? stocksByBranch.some((s) => s.stock > 0)
            : Number(p.stock) > 0;
        return {
            idProduct: Number(p.idProduct),
            idProductExt: p.idProductExt,
            name: p.name,
            price: Number(p.price),
            stockGlobal: Number(p.stock),
            stockBranch: preferred ? preferred.stock : Number(p.stock),
            sku: p.sku,
            upc: p.upc,
            marca: p.marca?.name || null,
            category: p.categories?.name || null,
            image_url: p.image_url,
            requiresSerial: Boolean(p.requiresSerial),
            warrantyMonths: p.warrantyMonths != null && Number(p.warrantyMonths) > 0
                ? Number(p.warrantyMonths)
                : null,
            warrantyMode: p.warrantyMode
                ? String(p.warrantyMode)
                : null,
            isPC: Number(p.isPC) === 1,
            providerId,
            providerName,
            stocksByBranch,
            suggestedBranchId: preferred && preferred.stock > 0
                ? preferred.branchId
                : preferred?.branchId ?? null,
            inStock,
            score,
        };
    });
}
function invalidatePosSearchCatalog() {
    // no-op: ya no hay caché full-catalog
}
/** Hidrata productos por id con el mismo shape que search (stock por bodega). */
async function hydratePosProductsByIds(productIds) {
    const ids = [
        ...new Set(productIds
            .map((id) => Number(id))
            .filter((id) => Number.isSafeInteger(id) && id > 0)),
    ];
    if (ids.length === 0)
        return [];
    const hasSerialCols = await (0, posSerialFlags_service_1.productsHaveSerialColumns)();
    const lightSelect = {
        idProduct: true,
        idProductExt: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        sku: true,
        upc: true,
        image_url: true,
        providerId: true,
        isPC: true,
        marca: { select: { name: true } },
        categories: { select: { name: true } },
        providers: { select: { companyName: true } },
    };
    const products = hasSerialCols
        ? await prismaClient_1.prisma.products.findMany({
            where: { active: 1, idProduct: { in: ids } },
            select: {
                ...lightSelect,
                requiresSerial: true,
                warrantyMonths: true,
                warrantyMode: true,
            },
        })
        : await prismaClient_1.prisma.products.findMany({
            where: { active: 1, idProduct: { in: ids } },
            select: lightSelect,
        });
    if (products.length === 0)
        return [];
    const foundIds = products.map((p) => Number(p.idProduct));
    const providerIds = [
        ...new Set(products.map((p) => Number(p.providerId)).filter((id) => id > 0)),
    ];
    const [stockRows, providerBranches] = await Promise.all([
        prismaClient_1.prisma.product_stock.findMany({
            where: { productId: { in: foundIds } },
            select: {
                productId: true,
                branchId: true,
                stock: true,
            },
        }),
        providerIds.length > 0
            ? prismaClient_1.prisma.branches.findMany({
                where: { providerId: { in: providerIds } },
                select: {
                    idBranche: true,
                    name: true,
                    city: true,
                    providerId: true,
                    providers: { select: { companyName: true } },
                },
            })
            : Promise.resolve([]),
    ]);
    const stockByProduct = new Map();
    for (const row of stockRows) {
        const pid = Number(row.productId);
        const bid = Number(row.branchId);
        let m = stockByProduct.get(pid);
        if (!m) {
            m = new Map();
            stockByProduct.set(pid, m);
        }
        m.set(bid, Number(row.stock ?? 0));
    }
    const branchesByProvider = new Map();
    for (const b of providerBranches) {
        const pid = Number(b.providerId);
        const list = branchesByProvider.get(pid) || [];
        list.push(b);
        branchesByProvider.set(pid, list);
    }
    return products.map((p) => {
        const providerId = Number(p.providerId);
        const providerName = p.providers?.companyName?.trim() || null;
        const stockMap = stockByProduct.get(Number(p.idProduct)) || new Map();
        const providerBranchList = branchesByProvider.get(providerId) || [];
        const stocksByBranch = buildPosStocksByBranch({
            providerId,
            providerName,
            providerBranchList,
            stockMap,
        });
        const preferred = stocksByBranch.find((s) => s.stock > 0) || stocksByBranch[0] || null;
        // Existencia real desde DB (product_stock / products.stock) para los 3 proveedores.
        const inStock = stocksByBranch.length > 0
            ? stocksByBranch.some((s) => s.stock > 0)
            : Number(p.stock) > 0;
        return {
            idProduct: Number(p.idProduct),
            idProductExt: p.idProductExt,
            name: p.name,
            price: Number(p.price),
            stockGlobal: Number(p.stock),
            stockBranch: preferred ? preferred.stock : Number(p.stock),
            sku: p.sku,
            upc: p.upc,
            marca: p.marca?.name || null,
            category: p.categories?.name || null,
            image_url: p.image_url,
            requiresSerial: Boolean(p.requiresSerial),
            warrantyMonths: p.warrantyMonths != null &&
                Number(p.warrantyMonths) > 0
                ? Number(p.warrantyMonths)
                : null,
            warrantyMode: p.warrantyMode
                ? String(p.warrantyMode)
                : null,
            isPC: Number(p.isPC) === 1,
            providerId,
            providerName,
            stocksByBranch,
            suggestedBranchId: preferred && preferred.stock > 0
                ? preferred.branchId
                : preferred?.branchId ?? null,
            inStock,
            score: 100,
        };
    });
}
//# sourceMappingURL=pos.service.js.map