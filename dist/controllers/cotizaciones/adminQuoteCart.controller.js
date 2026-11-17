"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAdminQuoteCart = exports.syncAdminQuoteCartLive = exports.removeAdminQuoteCartLine = exports.updateAdminQuoteCartQuantity = exports.addAdminQuoteCartLine = exports.mergeAdminQuoteCart = exports.replaceAdminQuoteCart = exports.getAdminQuoteCart = void 0;
const adminQuoteCart_service_1 = require("../../services/adminQuoteCart.service");
function userIdOf(req) {
    const userId = Number(req.idUser);
    if (!Number.isSafeInteger(userId) || userId <= 0)
        return null;
    return userId;
}
function requestedPage(value) {
    const page = Math.trunc(Number(value));
    return Number.isInteger(page) && page > 0 ? page : 1;
}
function sendCart(res, userId, lines, page, viewAll = false) {
    const payload = (0, adminQuoteCart_service_1.sliceQuoteCart)(lines, page, viewAll);
    return res.status(200).json({
        ok: true,
        ...payload,
        importedQuotes: (0, adminQuoteCart_service_1.listAdminImportedQuoteNumbers)(userId),
    });
}
const getAdminQuoteCart = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const lines = await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId);
    const viewAll = String(req.query.view || "") === "all";
    return sendCart(res, userId, lines, requestedPage(req.query.page), viewAll);
};
exports.getAdminQuoteCart = getAdminQuoteCart;
const replaceAdminQuoteCart = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : null;
    if (!rawLines) {
        return res.status(400).json({ ok: false, message: "El carrito no es válido." });
    }
    if (rawLines.length > adminQuoteCart_service_1.QUOTE_CART_MAX_LINES) {
        return res.status(400).json({
            ok: false,
            message: "El carrito admite como máximo 100 productos.",
        });
    }
    const lines = rawLines
        .map(adminQuoteCart_service_1.normalizeStoredQuoteLine)
        .filter((line) => Boolean(line));
    await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, lines);
    return sendCart(res, userId, lines, requestedPage(req.body?.page));
};
exports.replaceAdminQuoteCart = replaceAdminQuoteCart;
const mergeAdminQuoteCart = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : null;
    if (!rawLines) {
        return res.status(400).json({ ok: false, message: "El carrito no es válido." });
    }
    const incoming = rawLines
        .map(adminQuoteCart_service_1.normalizeStoredQuoteLine)
        .filter((line) => Boolean(line));
    const current = await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId);
    const merged = (0, adminQuoteCart_service_1.mergeQuoteCartLines)(current, incoming);
    if ("error" in merged) {
        return res.status(400).json({
            ok: false,
            message: "El carrito admite como máximo 100 productos.",
        });
    }
    (0, adminQuoteCart_service_1.stageAdminQuoteImport)(userId, req.body?.quoteNumber, incoming.map((line) => line.idProduct));
    await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, merged.lines);
    return sendCart(res, userId, merged.lines, merged.page);
};
exports.mergeAdminQuoteCart = mergeAdminQuoteCart;
const addAdminQuoteCartLine = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const requestedQuantity = req.body?.manual === true ? req.body?.quantity : 1;
    const incoming = (0, adminQuoteCart_service_1.normalizeStoredQuoteLine)({
        ...req.body,
        quantity: requestedQuantity,
    });
    if (!incoming) {
        return res.status(400).json({ ok: false, message: "El producto no es válido." });
    }
    const current = await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId);
    const result = (0, adminQuoteCart_service_1.upsertQuoteCartLine)(current, incoming);
    if ("error" in result) {
        return res.status(400).json({
            ok: false,
            message: "El carrito admite como máximo 100 productos.",
        });
    }
    await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, result.lines);
    return sendCart(res, userId, result.lines, result.page);
};
exports.addAdminQuoteCartLine = addAdminQuoteCartLine;
const updateAdminQuoteCartQuantity = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const idProduct = Number(req.body?.idProduct);
    const rawQuantity = req.body?.quantity;
    const quantity = rawQuantity === null || rawQuantity === ""
        ? null
        : Math.round(Number(rawQuantity));
    if (!Number.isSafeInteger(idProduct) || idProduct <= 0) {
        return res.status(400).json({ ok: false, message: "El producto no es válido." });
    }
    if (quantity !== null &&
        (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)) {
        return res.status(400).json({ ok: false, message: "La cantidad no es válida." });
    }
    const current = await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId);
    const next = (0, adminQuoteCart_service_1.setQuoteCartQuantity)(current, idProduct, quantity);
    if (!next) {
        return res.status(404).json({ ok: false, message: "El producto ya no está en el carrito." });
    }
    await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, next);
    return sendCart(res, userId, next, requestedPage(req.body?.page));
};
exports.updateAdminQuoteCartQuantity = updateAdminQuoteCartQuantity;
const removeAdminQuoteCartLine = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const idProduct = Number(req.params.idProduct);
    if (!Number.isSafeInteger(idProduct) || idProduct <= 0) {
        return res.status(400).json({ ok: false, message: "El producto no es válido." });
    }
    const next = (0, adminQuoteCart_service_1.removeQuoteCartLine)(await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId), idProduct);
    await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, next);
    return sendCart(res, userId, next, requestedPage(req.query.page));
};
exports.removeAdminQuoteCartLine = removeAdminQuoteCartLine;
const syncAdminQuoteCartLive = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    const updates = (0, adminQuoteCart_service_1.normalizeLiveQuoteUpdates)(req.body?.updates);
    const current = await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId);
    const patched = (0, adminQuoteCart_service_1.applyLiveQuoteUpdates)(current, updates);
    if (patched.changed) {
        await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, patched.lines);
    }
    return res.status(200).json({
        ok: true,
        ...(0, adminQuoteCart_service_1.sliceQuoteCart)(patched.lines, requestedPage(req.body?.page)),
        importedQuotes: (0, adminQuoteCart_service_1.listAdminImportedQuoteNumbers)(userId),
        changed: patched.changed,
    });
};
exports.syncAdminQuoteCartLive = syncAdminQuoteCartLive;
const clearAdminQuoteCart = async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) {
        return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
    }
    await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, []);
    return sendCart(res, userId, [], 1);
};
exports.clearAdminQuoteCart = clearAdminQuoteCart;
//# sourceMappingURL=adminQuoteCart.controller.js.map