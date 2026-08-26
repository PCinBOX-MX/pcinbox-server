"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sumProviderSubtotal = exports.buildPaymentPayload = exports.getCheckoutSummary = exports.calculateGroupQuote = exports.calculateZoneShipping = exports.calculateVolumetric = exports.calculateInsurance = exports.clearCheckoutDraft = exports.getCheckoutDraft = exports.saveCheckoutDraft = void 0;
const prismaClient_1 = require("../../db/prismaClient");
const shippingCalculation_service_1 = require("../../services/shipping/shippingCalculation.service");
Object.defineProperty(exports, "sumProviderSubtotal", { enumerable: true, get: function () { return shippingCalculation_service_1.sumProviderSubtotal; } });
const cart_service_1 = require("../../services/cart.service");
function resolveUserId(req) {
    const userId = Number(req.idUser);
    if (!userId || Number.isNaN(userId))
        return null;
    return userId;
}
function parseDraftValue(raw) {
    if (!raw)
        return null;
    if (typeof raw === "object")
        return raw;
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    return null;
}
let checkoutDraftsTableReady = false;
async function ensureCheckoutDraftsTable() {
    if (checkoutDraftsTableReady)
        return;
    await prismaClient_1.prisma.$executeRaw `
    CREATE TABLE IF NOT EXISTS checkout_drafts (
      userId BIGINT NOT NULL PRIMARY KEY,
      draft JSON NOT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
    checkoutDraftsTableReady = true;
}
async function upsertDraft(userId, draft) {
    await ensureCheckoutDraftsTable();
    const existing = await prismaClient_1.prisma.$queryRaw `
    SELECT userId FROM checkout_drafts WHERE userId = ${BigInt(userId)} LIMIT 1
  `;
    const payload = JSON.stringify(draft);
    if (existing.length > 0) {
        await prismaClient_1.prisma.$executeRaw `
      UPDATE checkout_drafts SET draft = ${payload}, updatedAt = NOW()
      WHERE userId = ${BigInt(userId)}
    `;
    }
    else {
        await prismaClient_1.prisma.$executeRaw `
      INSERT INTO checkout_drafts (userId, draft, updatedAt)
      VALUES (${BigInt(userId)}, ${payload}, NOW())
    `;
    }
}
async function readDraft(userId) {
    await ensureCheckoutDraftsTable();
    const rows = await prismaClient_1.prisma.$queryRaw `
    SELECT draft FROM checkout_drafts WHERE userId = ${BigInt(userId)} LIMIT 1
  `;
    if (!rows.length || rows[0]?.draft == null)
        return null;
    return parseDraftValue(rows[0].draft);
}
async function loadCartProducts(userId) {
    const cart = await (0, cart_service_1.getOrCreateActiveCart)(userId);
    await (0, cart_service_1.consolidateActiveCartItems)(userId, cart.idCart);
    const cartItems = await prismaClient_1.prisma.cartItems.findMany({
        where: { carId: cart.idCart, active: 1 },
        include: { products: true },
    });
    return cartItems
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({
        idProduct: String(item.products.idProduct),
        name: item.products.name,
        price: String(item.products.price),
        quantity: Number(item.quantity),
        providerId: String(item.products.providerId ?? ""),
        storeId: item.storeId,
        width: item.products.width,
        height: item.products.height,
        largo: item.products.largo,
        stock: item.products.stock,
        licenseType: item.products.licenseType ?? null,
    }));
}
async function loadBuyNowProduct(buyNow) {
    if (!buyNow?.idProduct)
        return [];
    const product = await prismaClient_1.prisma.products.findFirst({
        where: { idProduct: BigInt(buyNow.idProduct), active: 1 },
    });
    if (!product)
        return [];
    const quantity = Number(buyNow.quantity) || 1;
    if (quantity <= 0 || Number(product.stock) < quantity)
        return [];
    return [
        {
            idProduct: String(product.idProduct),
            name: product.name,
            price: String(product.price),
            quantity,
            providerId: String(product.providerId ?? ""),
            storeId: buyNow.storeId ?? null,
            width: product.width,
            height: product.height,
            largo: product.largo,
            stock: product.stock,
            licenseType: product.licenseType ?? null,
        },
    ];
}
async function resolveCheckoutProducts(userId, draft, bodyProducts) {
    if (draft?.checkoutMode === "buy_now" && draft.buyNow) {
        return loadBuyNowProduct(draft.buyNow);
    }
    if (Array.isArray(bodyProducts) && bodyProducts.length > 0) {
        return bodyProducts;
    }
    return loadCartProducts(userId);
}
/** Misma convención que el client: `${storeId|null}-${providerId}` (+ `-digital` para licencias). */
function isDigitalLicenseType(licenseType) {
    const value = String(licenseType ?? "").toLowerCase();
    return value === "windows" || value === "antivirus" || value === "office";
}
function deliveryGroupKeyFromProduct(product) {
    const storeRaw = product.storeId;
    const storeId = storeRaw == null || String(storeRaw) === "" || String(storeRaw) === "null"
        ? "null"
        : String(storeRaw);
    const base = `${storeId}-${String(product.providerId ?? "")}`;
    if (isDigitalLicenseType(product.licenseType)) {
        return `${base}-digital`;
    }
    return base;
}
function groupProducts(products) {
    const groups = {};
    for (const product of products) {
        const key = deliveryGroupKeyFromProduct(product);
        if (!groups[key])
            groups[key] = [];
        groups[key].push(product);
    }
    return groups;
}
/**
 * Verifica que cada grupo de productos tenga método de entrega.
 * No exige igualdad de conteo (pueden quedar keys stale en el draft).
 */
function missingDeliverySelection(grouped, deliveryGroups) {
    for (const groupKey of Object.keys(grouped)) {
        if (!deliveryGroups[groupKey]?.shipping_method) {
            return "Configura la entrega para todos los grupos de productos";
        }
    }
    return null;
}
function pruneDeliveryGroupsAgainstProducts(draft, products) {
    if (!draft?.deliveryGroups)
        return draft;
    const validKeys = new Set(Object.keys(groupProducts(products)));
    return {
        ...draft,
        deliveryGroups: Object.fromEntries(Object.entries(draft.deliveryGroups).filter(([key]) => validKeys.has(key))),
    };
}
async function pruneDeliveryGroups(userId, draft) {
    const products = await resolveCheckoutProducts(userId, draft);
    const validKeys = new Set(Object.keys(groupProducts(products)));
    if (!draft.deliveryGroups)
        return draft;
    return {
        ...draft,
        deliveryGroups: Object.fromEntries(Object.entries(draft.deliveryGroups).filter(([key]) => validKeys.has(key))),
    };
}
function validateDeliverySelections(groupedForCalc) {
    for (const [groupKey, group] of Object.entries(groupedForCalc)) {
        const { selection } = group;
        if (selection.shipping_method === "envioLeon" && !selection.idAddress) {
            return `Selecciona una dirección de entrega para ${groupKey}`;
        }
    }
    return null;
}
const saveCheckoutDraft = async (req, res) => {
    try {
        const userId = resolveUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
        }
        const incoming = req.body;
        const current = (await readDraft(userId)) || {};
        // Merge superficial, pero entrega/pago admiten `null` para resetear
        // (p. ej. vaciar carrito / nuevo comprar-ahora). `{}` solo no borra.
        let merged = {
            ...current,
            ...incoming,
        };
        if (incoming.deliveryGroups === null) {
            merged.deliveryGroups = {};
        }
        else if (incoming.deliveryGroups !== undefined) {
            merged.deliveryGroups = {
                ...(current.deliveryGroups || {}),
                ...incoming.deliveryGroups,
            };
        }
        else if (current.deliveryGroups !== undefined) {
            merged.deliveryGroups = current.deliveryGroups;
        }
        else {
            delete merged.deliveryGroups;
        }
        if (incoming.paymentMethod === null) {
            merged.paymentMethod = null;
        }
        else if (incoming.paymentMethod !== undefined) {
            merged.paymentMethod = incoming.paymentMethod;
        }
        else if (current.paymentMethod !== undefined) {
            merged.paymentMethod = current.paymentMethod;
        }
        else {
            delete merged.paymentMethod;
        }
        merged = await pruneDeliveryGroups(userId, merged);
        await upsertDraft(userId, merged);
        return res.status(200).json({ ok: true, data: merged });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al guardar borrador de checkout",
            error: error.message,
        });
    }
};
exports.saveCheckoutDraft = saveCheckoutDraft;
const getCheckoutDraft = async (req, res) => {
    try {
        const userId = resolveUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
        }
        const draft = await readDraft(userId);
        return res.status(200).json({ ok: true, data: draft });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al obtener borrador de checkout",
            error: error.message,
        });
    }
};
exports.getCheckoutDraft = getCheckoutDraft;
const clearCheckoutDraft = async (req, res) => {
    try {
        const userId = resolveUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
        }
        await ensureCheckoutDraftsTable();
        await prismaClient_1.prisma.$executeRaw `
      DELETE FROM checkout_drafts WHERE userId = ${BigInt(userId)}
    `;
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al limpiar borrador de checkout",
            error: error.message,
        });
    }
};
exports.clearCheckoutDraft = clearCheckoutDraft;
const calculateInsurance = async (req, res) => {
    try {
        const subtotal = Number(req.body?.subtotal);
        if (!Number.isFinite(subtotal) || subtotal < 0) {
            return res.status(400).json({ ok: false, message: "Subtotal inválido" });
        }
        const cost = (0, shippingCalculation_service_1.calcInsuranceCost)(subtotal);
        return res.status(200).json({ ok: true, data: { cost } });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al calcular seguro",
            error: error.message,
        });
    }
};
exports.calculateInsurance = calculateInsurance;
const calculateVolumetric = async (req, res) => {
    try {
        const { products } = req.body;
        const volume = (0, shippingCalculation_service_1.sumProductVolume)(products || []);
        const result = (0, shippingCalculation_service_1.calcVolumetricShipping)(volume);
        return res.status(200).json({ ok: true, data: result });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al calcular envío volumétrico",
            error: error.message,
        });
    }
};
exports.calculateVolumetric = calculateVolumetric;
const calculateZoneShipping = async (req, res) => {
    try {
        const userId = resolveUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
        }
        const { idAddress } = req.body;
        const cost = await (0, shippingCalculation_service_1.getZoneShippingCost)(Number(idAddress), userId);
        return res.status(200).json({ ok: true, data: { cost } });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error.message || "Error al calcular envío por zona",
            error: error.message,
        });
    }
};
exports.calculateZoneShipping = calculateZoneShipping;
const calculateGroupQuote = async (req, res) => {
    try {
        const { products, selection } = req.body;
        if (!selection?.shipping_method) {
            return res.status(400).json({ ok: false, message: "Selecciona un método de entrega para continuar." });
        }
        const priceValidation = await (0, shippingCalculation_service_1.validateProductPrices)(products || []);
        if (!priceValidation.ok) {
            return res.status(400).json({ ok: false, message: priceValidation.message });
        }
        const costs = await (0, shippingCalculation_service_1.calculateGroupCosts)(products || [], selection);
        if (costs.error) {
            return res.status(400).json({ ok: false, message: costs.error });
        }
        return res.status(200).json({ ok: true, data: costs });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al calcular cotización del grupo",
            error: error.message,
        });
    }
};
exports.calculateGroupQuote = calculateGroupQuote;
const getCheckoutSummary = async (req, res) => {
    try {
        const userId = resolveUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
        }
        const rawDraft = await readDraft(userId);
        const bodyProducts = req.body?.products;
        const products = await resolveCheckoutProducts(userId, rawDraft, bodyProducts);
        if (!products.length) {
            return res.status(400).json({
                ok: false,
                message: "No hay productos en el checkout",
            });
        }
        const draft = pruneDeliveryGroupsAgainstProducts(rawDraft, products);
        const priceValidation = await (0, shippingCalculation_service_1.validateProductPrices)(products);
        if (!priceValidation.ok) {
            return res.status(400).json({
                ok: false,
                message: priceValidation.message,
            });
        }
        const grouped = groupProducts(products);
        const deliveryGroups = draft?.deliveryGroups || {};
        const incompleteDelivery = missingDeliverySelection(grouped, deliveryGroups);
        if (incompleteDelivery) {
            const subtotal = (0, shippingCalculation_service_1.calculateProductsSubtotal)(products);
            return res.status(200).json({
                ok: true,
                data: {
                    draft,
                    products,
                    dataPurchase: {},
                    subtotal,
                    shippingTotal: 0,
                    total: subtotal,
                    paymentMethod: draft?.paymentMethod ?? null,
                    needsDeliveryConfig: true,
                    message: incompleteDelivery,
                },
            });
        }
        const groupedForCalc = {};
        for (const [groupKey, groupProductsList] of Object.entries(grouped)) {
            const selection = deliveryGroups[groupKey];
            groupedForCalc[groupKey] = {
                products: groupProductsList,
                selection: {
                    shipping_method: selection.shipping_method,
                    idAddress: selection.idAddress ?? null,
                    wantsInsurance: selection.wantsInsurance ?? null,
                },
            };
        }
        const deliveryError = validateDeliverySelections(groupedForCalc);
        if (deliveryError) {
            const subtotal = (0, shippingCalculation_service_1.calculateProductsSubtotal)(products);
            return res.status(200).json({
                ok: true,
                data: {
                    draft,
                    products,
                    dataPurchase: {},
                    subtotal,
                    shippingTotal: 0,
                    total: subtotal,
                    paymentMethod: draft?.paymentMethod ?? null,
                    needsDeliveryConfig: true,
                    message: deliveryError,
                },
            });
        }
        const dataPurchase = await (0, shippingCalculation_service_1.buildDataPurchaseFromSelections)(groupedForCalc);
        const subtotal = (0, shippingCalculation_service_1.calculateProductsSubtotal)(products);
        const shippingTotal = (0, shippingCalculation_service_1.calculateExtrasTotal)(dataPurchase);
        const total = Math.round((subtotal + shippingTotal) * 100) / 100;
        return res.status(200).json({
            ok: true,
            data: {
                draft,
                products,
                dataPurchase,
                subtotal,
                shippingTotal,
                total,
                paymentMethod: draft?.paymentMethod ?? null,
                needsDeliveryConfig: false,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error.message || "Error al calcular resumen de checkout",
            error: error.message,
        });
    }
};
exports.getCheckoutSummary = getCheckoutSummary;
const buildPaymentPayload = async (req, res) => {
    try {
        const userId = resolveUserId(req);
        if (!userId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado" });
        }
        const { requiredFactura, products: bodyProducts } = req.body;
        const rawDraft = await readDraft(userId);
        const products = await resolveCheckoutProducts(userId, rawDraft, bodyProducts);
        if (!products.length) {
            return res.status(400).json({
                ok: false,
                message: "No hay productos en el checkout",
            });
        }
        const draft = pruneDeliveryGroupsAgainstProducts(rawDraft, products);
        if (!draft?.paymentMethod?.name) {
            return res.status(400).json({
                ok: false,
                message: "Selecciona un método de pago",
            });
        }
        const grouped = groupProducts(products);
        const deliveryGroups = draft.deliveryGroups || {};
        const incompleteDelivery = missingDeliverySelection(grouped, deliveryGroups);
        if (incompleteDelivery) {
            return res.status(400).json({
                ok: false,
                message: incompleteDelivery,
            });
        }
        const groupedForCalc = {};
        for (const [groupKey, groupProductsList] of Object.entries(grouped)) {
            const selection = deliveryGroups[groupKey];
            groupedForCalc[groupKey] = {
                products: groupProductsList,
                selection: {
                    shipping_method: selection.shipping_method,
                    idAddress: selection.idAddress ?? null,
                    wantsInsurance: selection.wantsInsurance ?? null,
                },
            };
        }
        const deliveryError = validateDeliverySelections(groupedForCalc);
        if (deliveryError) {
            return res.status(400).json({ ok: false, message: deliveryError });
        }
        const priceValidation = await (0, shippingCalculation_service_1.validateProductPrices)(products);
        if (!priceValidation.ok) {
            return res.status(400).json({
                ok: false,
                message: priceValidation.message,
            });
        }
        const dataPurchase = await (0, shippingCalculation_service_1.buildDataPurchaseFromSelections)(groupedForCalc);
        const subtotal = (0, shippingCalculation_service_1.calculateProductsSubtotal)(products);
        const shippingTotal = (0, shippingCalculation_service_1.calculateExtrasTotal)(dataPurchase);
        const amount = Math.round((subtotal + shippingTotal) * 100) / 100;
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({
                ok: false,
                message: "Monto total inválido",
            });
        }
        return res.status(200).json({
            ok: true,
            data: {
                userId,
                amount,
                subtotal,
                shippingTotal,
                dataPurchase,
                dataProduct: products,
                pay: draft.paymentMethod,
                requiredFactura: requiredFactura === true,
            },
        });
    }
    catch (error) {
        console.error("[checkout] buildPaymentPayload:", error);
        return res.status(500).json({
            ok: false,
            message: "No pudimos preparar el pago. Revisa tu carrito y la entrega e inténtalo de nuevo.",
        });
    }
};
exports.buildPaymentPayload = buildPaymentPayload;
//# sourceMappingURL=checkout.controller.js.map