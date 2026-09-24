"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POS_MANUAL_SERVICE_SKU = exports.POS_MANUAL_PRODUCT_SKU = void 0;
exports.ensurePosManualProduct = ensurePosManualProduct;
exports.ensurePosManualLineProduct = ensurePosManualLineProduct;
exports.getPosManualPlaceholderIds = getPosManualPlaceholderIds;
const prismaClient_1 = require("../../db/prismaClient");
/** SKU comodín: producto capturado a mano en POS. */
exports.POS_MANUAL_PRODUCT_SKU = "__POS_MANUAL__";
/** SKU comodín: servicio adicional capturado en POS. */
exports.POS_MANUAL_SERVICE_SKU = "__POS_SERVICE__";
const SELECT = {
    idProduct: true,
    name: true,
    price: true,
    sku: true,
    upc: true,
    stock: true,
    providerId: true,
    warrantyMonths: true,
    requiresSerial: true,
};
async function ensurePlaceholder(tx, kind) {
    const sku = kind === "service" ? exports.POS_MANUAL_SERVICE_SKU : exports.POS_MANUAL_PRODUCT_SKU;
    const existing = await tx.products.findFirst({
        where: { sku },
        select: SELECT,
    });
    if (existing)
        return existing;
    const provider = await tx.providers.findFirst({
        orderBy: { idProvider: "asc" },
        select: { idProvider: true },
    });
    if (!provider) {
        throw new Error("No hay proveedores en catálogo para crear el producto/servicio manual POS");
    }
    return tx.products.create({
        data: {
            name: kind === "service"
                ? "Servicio adicional POS"
                : "Producto manual POS",
            description: kind === "service"
                ? "Servicio adicional capturado en Punto de Venta (sin stock)"
                : "Línea capturada manualmente en Punto de Venta",
            price: 0,
            stock: 999999,
            sku,
            providerId: provider.idProvider,
            active: 1,
            requiresSerial: false,
            warrantyMonths: kind === "service" ? 0 : 12,
        },
        select: SELECT,
    });
}
/** @deprecated Prefer ensurePosManualLineProduct(kind) */
async function ensurePosManualProduct(tx = prismaClient_1.prisma) {
    return ensurePlaceholder(tx, "product");
}
async function ensurePosManualLineProduct(kind = "product", tx = prismaClient_1.prisma) {
    return ensurePlaceholder(tx, kind === "service" ? "service" : "product");
}
/** IDs de comodines que no deben tocar inventario. */
async function getPosManualPlaceholderIds(tx = prismaClient_1.prisma) {
    const rows = await tx.products.findMany({
        where: {
            sku: { in: [exports.POS_MANUAL_PRODUCT_SKU, exports.POS_MANUAL_SERVICE_SKU] },
        },
        select: { idProduct: true },
    });
    return rows.map((r) => Number(r.idProduct));
}
//# sourceMappingURL=posManualProduct.service.js.map