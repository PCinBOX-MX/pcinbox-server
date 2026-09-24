"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsHaveSerialColumns = productsHaveSerialColumns;
exports.getProductSerialFlags = getProductSerialFlags;
const prismaClient_1 = require("../../db/prismaClient");
let serialColumnsCache = null;
/** true si `products.requiresSerial` / `warrantyMonths` ya existen en MySQL. */
async function productsHaveSerialColumns() {
    if (serialColumnsCache != null)
        return serialColumnsCache;
    try {
        const rows = await prismaClient_1.prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = 'requiresSerial'`);
        serialColumnsCache = Number(rows[0]?.c ?? 0) > 0;
    }
    catch {
        serialColumnsCache = false;
    }
    return serialColumnsCache;
}
async function getProductSerialFlags(productId) {
    const has = await productsHaveSerialColumns();
    if (!has) {
        return {
            requiresSerial: false,
            warrantyMonths: null,
            warrantyMode: null,
            isPC: false,
            providerId: null,
        };
    }
    const row = await prismaClient_1.prisma.products.findFirst({
        where: { idProduct: productId },
        select: {
            requiresSerial: true,
            warrantyMonths: true,
            warrantyMode: true,
            isPC: true,
            providerId: true,
        },
    });
    const months = row?.warrantyMonths != null && Number(row.warrantyMonths) > 0
        ? Number(row.warrantyMonths)
        : null;
    return {
        requiresSerial: Boolean(row?.requiresSerial),
        warrantyMonths: months,
        warrantyMode: row?.warrantyMode ? String(row.warrantyMode) : null,
        isPC: Number(row?.isPC) === 1,
        providerId: row?.providerId != null ? Number(row.providerId) : null,
    };
}
//# sourceMappingURL=posSerialFlags.service.js.map