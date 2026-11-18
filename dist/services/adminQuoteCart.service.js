"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUOTE_CART_MAX_LINES = exports.QUOTE_CART_PAGE_SIZE = void 0;
exports.normalizeStoredQuoteLine = normalizeStoredQuoteLine;
exports.quoteCartTotal = quoteCartTotal;
exports.sliceQuoteCart = sliceQuoteCart;
exports.upsertQuoteCartLine = upsertQuoteCartLine;
exports.mergeQuoteCartLines = mergeQuoteCartLines;
exports.setQuoteCartQuantity = setQuoteCartQuantity;
exports.removeQuoteCartLine = removeQuoteCartLine;
exports.normalizeLiveQuoteUpdates = normalizeLiveQuoteUpdates;
exports.applyLiveQuoteUpdates = applyLiveQuoteUpdates;
exports.readAdminQuoteCart = readAdminQuoteCart;
exports.stageAdminQuoteImport = stageAdminQuoteImport;
exports.forgetAdminQuoteImport = forgetAdminQuoteImport;
exports.listAdminImportedQuoteNumbers = listAdminImportedQuoteNumbers;
exports.writeAdminQuoteCart = writeAdminQuoteCart;
const cache_util_1 = require("../infra/redis/cache.util");
const quoteLines_service_1 = require("./quoteLines.service");
exports.QUOTE_CART_PAGE_SIZE = 4;
exports.QUOTE_CART_MAX_LINES = 100;
const CART_TTL_SEC = 60 * 60 * 24 * 30;
const QUOTE_NUMBER_PATTERN = /^(?:\d{13}|COT-[A-Z0-9-]{8,55})$/;
const memoryCarts = new Map();
function cartKey(userId) {
    return `admin-quote-cart:v1:${userId}`;
}
function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function normalizeStoredQuoteLine(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const line = raw;
    const idProduct = Number(line.idProduct);
    const name = String(line.name || "").trim();
    const price = Number(line.price);
    if (!Number.isSafeInteger(idProduct) || idProduct <= 0 || !name)
        return null;
    if (!Number.isFinite(price) || price < 0)
        return null;
    let quantity = null;
    if (line.quantity !== null && line.quantity !== "" && line.quantity !== undefined) {
        const parsed = Math.round(Number(line.quantity));
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999)
            return null;
        quantity = parsed;
    }
    const stocksByBranch = Array.isArray(line.stocksByBranch)
        ? line.stocksByBranch
            .map((branch) => {
            if (!branch || typeof branch !== "object")
                return null;
            const item = branch;
            const branchId = Number(item.branchId);
            const label = String(item.label || "").trim();
            const stock = Number(item.stock);
            if (!Number.isSafeInteger(branchId) || branchId <= 0 || !label)
                return null;
            return {
                branchId,
                label: label.slice(0, 80),
                stock: Number.isFinite(stock) ? stock : 0,
            };
        })
            .filter((branch) => Boolean(branch))
            .slice(0, 20)
        : [];
    return {
        idProduct,
        name: name.slice(0, 180),
        description: typeof line.description === "string" ? line.description.slice(0, 4000) : null,
        caracteristicas: line.caracteristicas ?? null,
        price,
        image_url: line.image_url ?? null,
        upc: typeof line.upc === "string" ? line.upc.slice(0, 64) : null,
        sku: typeof line.sku === "string" ? line.sku.slice(0, 64) : null,
        active: line.active === true,
        stock: Number.isFinite(Number(line.stock)) ? Number(line.stock) : 0,
        stocksByBranch,
        quantity,
        manual: line.manual === true,
    };
}
function quoteCartTotal(lines) {
    return roundMoney(lines.reduce((sum, line) => {
        const quantity = line.quantity ?? 0;
        return sum + line.price * quantity;
    }, 0));
}
function sliceQuoteCart(lines, requestedPage, viewAll = false) {
    const total = lines.length;
    const totalPages = Math.max(1, Math.ceil(total / exports.QUOTE_CART_PAGE_SIZE));
    const page = viewAll
        ? 1
        : Math.min(Math.max(1, Math.trunc(requestedPage) || 1), total === 0 ? 1 : totalPages);
    const start = viewAll ? 0 : (page - 1) * exports.QUOTE_CART_PAGE_SIZE;
    const size = viewAll ? exports.QUOTE_CART_MAX_LINES : exports.QUOTE_CART_PAGE_SIZE;
    return {
        data: lines.slice(start, start + size),
        pagination: {
            page,
            limit: exports.QUOTE_CART_PAGE_SIZE,
            total,
            totalPages: total === 0 ? 0 : totalPages,
        },
        totalAmount: quoteCartTotal(lines),
    };
}
function upsertQuoteCartLine(lines, incoming) {
    const index = lines.findIndex((line) => line.idProduct === incoming.idProduct);
    let next = lines;
    if (index >= 0) {
        const current = lines[index];
        if (!current)
            return { lines, page: 1 };
        const base = current.quantity ?? 0;
        next = lines.map((line, lineIndex) => lineIndex === index
            ? { ...incoming, quantity: Math.min(999, base + 1) }
            : line);
    }
    else {
        if (lines.length >= exports.QUOTE_CART_MAX_LINES)
            return { error: "full" };
        next = [...lines, { ...incoming, quantity: incoming.quantity ?? 1 }];
    }
    const placed = next.findIndex((line) => line.idProduct === incoming.idProduct);
    return { lines: next, page: Math.floor(placed / exports.QUOTE_CART_PAGE_SIZE) + 1 };
}
function mergeQuoteCartLines(current, incoming) {
    const next = current.map((line) => ({ ...line }));
    let page = 1;
    for (const line of incoming) {
        const index = next.findIndex((item) => item.idProduct === line.idProduct);
        const add = line.quantity ?? 1;
        if (index >= 0) {
            const existing = next[index];
            if (!existing)
                continue;
            next[index] = {
                ...existing,
                quantity: Math.min(999, (existing.quantity ?? 0) + add),
            };
            continue;
        }
        if (next.length >= exports.QUOTE_CART_MAX_LINES)
            return { error: "full" };
        next.push({ ...line, quantity: add });
        page = Math.floor((next.length - 1) / exports.QUOTE_CART_PAGE_SIZE) + 1;
    }
    return { lines: next, page };
}
function setQuoteCartQuantity(lines, idProduct, quantity) {
    const index = lines.findIndex((line) => line.idProduct === idProduct);
    if (index < 0)
        return null;
    return lines.map((line, lineIndex) => lineIndex === index ? { ...line, quantity } : line);
}
function removeQuoteCartLine(lines, idProduct) {
    return lines.filter((line) => line.idProduct !== idProduct);
}
function normalizeLines(raw) {
    return raw
        .map(normalizeStoredQuoteLine)
        .filter((line) => Boolean(line))
        .slice(0, exports.QUOTE_CART_MAX_LINES);
}
function normalizeImportedQuote(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const item = raw;
    const quoteNumber = (0, quoteLines_service_1.normalizeQuoteNumber)(item.quoteNumber);
    if (!QUOTE_NUMBER_PATTERN.test(quoteNumber))
        return null;
    const productIds = [
        ...new Set((Array.isArray(item.productIds) ? item.productIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isSafeInteger(id) && id > 0)),
    ].slice(0, exports.QUOTE_CART_MAX_LINES);
    if (productIds.length === 0)
        return null;
    return { quoteNumber, productIds };
}
function pruneImportedQuotes(lines, quotes) {
    const ids = new Set(lines.map((line) => line.idProduct));
    const seen = new Set();
    const next = [];
    for (const quote of quotes) {
        if (seen.has(quote.quoteNumber))
            continue;
        const productIds = quote.productIds.filter((id) => ids.has(id));
        if (productIds.length === 0)
            continue;
        seen.add(quote.quoteNumber);
        next.push({ quoteNumber: quote.quoteNumber, productIds });
    }
    return next.slice(0, 20);
}
function parseStoredCart(stored) {
    if (Array.isArray(stored)) {
        return { lines: normalizeLines(stored), importedQuotes: [] };
    }
    if (!stored || typeof stored !== "object") {
        return { lines: [], importedQuotes: [] };
    }
    const body = stored;
    const lines = Array.isArray(body.lines) ? normalizeLines(body.lines) : [];
    const importedQuotes = Array.isArray(body.importedQuotes)
        ? body.importedQuotes
            .map(normalizeImportedQuote)
            .filter((quote) => Boolean(quote))
        : [];
    return { lines, importedQuotes: pruneImportedQuotes(lines, importedQuotes) };
}
function cloneCart(cart) {
    return {
        lines: cart.lines.map((line) => ({ ...line })),
        importedQuotes: cart.importedQuotes.map((quote) => ({
            quoteNumber: quote.quoteNumber,
            productIds: [...quote.productIds],
        })),
    };
}
async function loadCart(userId) {
    const cached = memoryCarts.get(userId);
    if (cached)
        return cloneCart(cached);
    const stored = await (0, cache_util_1.cacheGetJson)(cartKey(userId));
    const parsed = parseStoredCart(stored);
    memoryCarts.set(userId, parsed);
    return cloneCart(parsed);
}
const DISPLAY_KEYS = {
    "pcinbox-gdl": ["gdl"],
    "pcinbox-cdmx": ["cdmx"],
    "pcinbox-sfd": ["santafe"],
    "pcinbox-leon": ["leon2", "leon"],
    "pcinbox-ag2d": ["dicoags2"],
    "pcinbox-agd": ["arboledas"],
};
function liveNorm(value) {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");
}
function matchLiveBranchStock(label, branchId, branches) {
    const labelKey = liveNorm(label);
    const aliases = DISPLAY_KEYS[labelKey] ?? [];
    const idKey = String(branchId);
    for (const [rawKey, qty] of Object.entries(branches)) {
        const key = liveNorm(rawKey);
        if (!key)
            continue;
        const hit = key === labelKey ||
            key === idKey ||
            aliases.includes(key) ||
            (key.length >= 3 && (labelKey.includes(key) || key.includes(labelKey)));
        if (!hit)
            continue;
        return Math.max(0, Number(qty) || 0);
    }
    return null;
}
function normalizeLiveQuoteUpdates(raw) {
    if (!Array.isArray(raw))
        return [];
    const next = [];
    for (const row of raw.slice(0, 400)) {
        if (!row || typeof row !== "object")
            continue;
        const item = row;
        const idProduct = Number(item.idProduct);
        if (!Number.isSafeInteger(idProduct) || idProduct <= 0)
            continue;
        const price = item.price == null ? undefined : Number(item.price);
        const stock = item.stock == null ? undefined : Number(item.stock);
        const activeRaw = item.active == null ? undefined : Number(item.active);
        let branches;
        if (item.branches && typeof item.branches === "object" && !Array.isArray(item.branches)) {
            branches = {};
            for (const [key, value] of Object.entries(item.branches)) {
                const qty = Number(value);
                if (!key.trim() || !Number.isFinite(qty))
                    continue;
                branches[key.slice(0, 80)] = Math.max(0, qty);
            }
        }
        const update = { idProduct };
        if (price != null && Number.isFinite(price) && price >= 0)
            update.price = price;
        if (stock != null && Number.isFinite(stock))
            update.stock = Math.max(0, stock);
        if (activeRaw === 0 || activeRaw === 1)
            update.active = activeRaw;
        if (branches && Object.keys(branches).length > 0)
            update.branches = branches;
        next.push(update);
    }
    return next;
}
function patchStoredLiveLine(line, update) {
    let price = line.price;
    let stock = line.stock;
    let active = line.active;
    let stocksByBranch = line.stocksByBranch;
    let touched = false;
    if (update.price != null && update.price !== price) {
        price = Math.round((update.price + Number.EPSILON) * 100) / 100;
        touched = true;
    }
    if (update.active != null) {
        const nextActive = update.active === 1;
        if (nextActive !== active) {
            active = nextActive;
            touched = true;
        }
    }
    if (update.branches && Object.keys(update.branches).length > 0 && stocksByBranch.length > 0) {
        let branchChanged = false;
        const nextBranches = stocksByBranch.map((branch) => {
            const nextStock = matchLiveBranchStock(branch.label, branch.branchId, update.branches);
            if (nextStock == null || nextStock === branch.stock)
                return branch;
            branchChanged = true;
            return { ...branch, stock: nextStock };
        });
        if (branchChanged) {
            stocksByBranch = nextBranches;
            stock = nextBranches.reduce((sum, branch) => sum + branch.stock, 0);
            touched = true;
        }
    }
    else if (update.stock != null && stocksByBranch.length === 0 && update.stock !== stock) {
        stock = update.stock;
        touched = true;
    }
    if (!touched)
        return line;
    return { ...line, price, stock, active, stocksByBranch };
}
function applyLiveQuoteUpdates(lines, updates) {
    if (lines.length === 0 || updates.length === 0)
        return { lines, changed: false };
    const byId = new Map(updates.map((update) => [update.idProduct, update]));
    let changed = false;
    const next = lines.map((line) => {
        const update = byId.get(line.idProduct);
        if (!update)
            return line;
        const patched = patchStoredLiveLine(line, update);
        if (patched !== line)
            changed = true;
        return patched;
    });
    return { lines: changed ? next : lines, changed };
}
async function readAdminQuoteCart(userId) {
    const cart = await loadCart(userId);
    return cart.lines;
}
function stageAdminQuoteImport(userId, rawQuoteNumber, productIds) {
    const current = memoryCarts.get(userId);
    if (!current)
        return;
    const quoteNumber = (0, quoteLines_service_1.normalizeQuoteNumber)(rawQuoteNumber);
    if (!QUOTE_NUMBER_PATTERN.test(quoteNumber))
        return;
    const ids = [
        ...new Set(productIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
    ];
    if (ids.length === 0)
        return;
    current.importedQuotes = [
        ...current.importedQuotes.filter((quote) => quote.quoteNumber !== quoteNumber),
        { quoteNumber, productIds: ids },
    ];
}
function forgetAdminQuoteImport(userId, rawQuoteNumber) {
    const current = memoryCarts.get(userId);
    if (!current)
        return;
    const quoteNumber = (0, quoteLines_service_1.normalizeQuoteNumber)(rawQuoteNumber);
    current.importedQuotes = current.importedQuotes.filter((quote) => quote.quoteNumber !== quoteNumber);
}
function listAdminImportedQuoteNumbers(userId) {
    return (memoryCarts.get(userId)?.importedQuotes ?? []).map((quote) => quote.quoteNumber);
}
async function writeAdminQuoteCart(userId, lines) {
    const current = memoryCarts.get(userId) ?? (await loadCart(userId));
    const nextLines = lines.slice(0, exports.QUOTE_CART_MAX_LINES);
    if (nextLines.length === 0) {
        memoryCarts.delete(userId);
        await (0, cache_util_1.cacheDel)(cartKey(userId));
        return;
    }
    const next = {
        lines: nextLines,
        importedQuotes: pruneImportedQuotes(nextLines, current.importedQuotes),
    };
    memoryCarts.set(userId, next);
    await (0, cache_util_1.cacheSetJson)(cartKey(userId), next, CART_TTL_SEC);
}
//# sourceMappingURL=adminQuoteCart.service.js.map