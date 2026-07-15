"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeStoreId = normalizeStoreId;
exports.getOrCreateActiveCart = getOrCreateActiveCart;
exports.consolidateActiveCartItems = consolidateActiveCartItems;
exports.findActiveCartItem = findActiveCartItem;
exports.mergeDuplicateCartLines = mergeDuplicateCartLines;
exports.deactivateAllActiveCartItems = deactivateAllActiveCartItems;
exports.resolveAvailableStock = resolveAvailableStock;
const prismaClient_1 = require("../db/prismaClient");
function normalizeStoreId(storeId) {
    if (storeId === null || storeId === undefined || storeId === "")
        return null;
    const parsed = Number(storeId);
    return Number.isNaN(parsed) ? null : parsed;
}
async function getOrCreateActiveCart(userId) {
    const existing = await prismaClient_1.prisma.carts.findFirst({
        where: {
            userId,
            status: "active",
        },
        orderBy: { idCart: "desc" },
    });
    if (existing)
        return existing;
    return prismaClient_1.prisma.carts.create({
        data: {
            userId,
            status: "active",
            createdAt: new Date(),
        },
    });
}
/**
 * Mueve ítems activos huérfanos (en carritos no activos del mismo usuario)
 * al carrito activo para que getCart y addProduct vean lo mismo.
 */
async function consolidateActiveCartItems(userId, activeCartId) {
    const misplaced = await prismaClient_1.prisma.cartItems.findMany({
        where: {
            active: 1,
            carId: { not: activeCartId },
            carts: { userId },
        },
    });
    for (const item of misplaced) {
        const storeId = item.storeId ?? null;
        const existingOnActive = await prismaClient_1.prisma.cartItems.findFirst({
            where: {
                carId: activeCartId,
                productId: item.productId,
                storeId,
                active: 1,
            },
        });
        if (existingOnActive) {
            await prismaClient_1.prisma.cartItems.update({
                where: { idCartItem: existingOnActive.idCartItem },
                data: {
                    quantity: Math.max(Number(existingOnActive.quantity ?? 0), Number(item.quantity ?? 0)),
                },
            });
            await prismaClient_1.prisma.cartItems.update({
                where: { idCartItem: item.idCartItem },
                data: { active: 0, quantity: 0 },
            });
        }
        else {
            await prismaClient_1.prisma.cartItems.update({
                where: { idCartItem: item.idCartItem },
                data: { carId: activeCartId },
            });
        }
    }
}
async function findActiveCartItem(carId, productId, storeId) {
    const exact = await prismaClient_1.prisma.cartItems.findFirst({
        where: {
            carId,
            productId,
            storeId,
            active: 1,
        },
    });
    if (exact)
        return exact;
    const allForProduct = await prismaClient_1.prisma.cartItems.findMany({
        where: {
            carId,
            productId,
            active: 1,
        },
        orderBy: { idCartItem: "desc" },
    });
    if (allForProduct.length === 0)
        return null;
    if (allForProduct.length === 1)
        return allForProduct[0];
    if (storeId !== null) {
        const byStore = allForProduct.find((item) => item.storeId != null && Number(item.storeId) === Number(storeId));
        if (byStore)
            return byStore;
    }
    return allForProduct.reduce((best, item) => Number(item.quantity ?? 0) > Number(best.quantity ?? 0) ? item : best);
}
/**
 * Une líneas duplicadas del mismo producto (p. ej. storeId null vs sucursal)
 * para que addProduct y getCart vean la misma cantidad.
 */
async function mergeDuplicateCartLines(carId, productId, preferredStoreId) {
    const lines = await prismaClient_1.prisma.cartItems.findMany({
        where: {
            carId,
            productId,
            active: 1,
        },
        orderBy: { idCartItem: "asc" },
    });
    if (lines.length <= 1) {
        return lines[0] ?? null;
    }
    const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
    const keeper = (preferredStoreId !== null
        ? lines.find((line) => line.storeId != null &&
            Number(line.storeId) === Number(preferredStoreId))
        : lines.find((line) => line.storeId === null)) ?? lines[0];
    if (!keeper) {
        return null;
    }
    await prismaClient_1.prisma.cartItems.update({
        where: { idCartItem: keeper.idCartItem },
        data: {
            quantity: totalQty,
            storeId: preferredStoreId ?? keeper.storeId,
        },
    });
    const toDeactivate = lines.filter((line) => line.idCartItem !== keeper.idCartItem);
    if (toDeactivate.length > 0) {
        await prismaClient_1.prisma.cartItems.updateMany({
            where: {
                idCartItem: { in: toDeactivate.map((line) => line.idCartItem) },
            },
            data: { active: 0, quantity: 0 },
        });
    }
    return prismaClient_1.prisma.cartItems.findFirst({
        where: { idCartItem: keeper.idCartItem },
    });
}
async function deactivateAllActiveCartItems(carId) {
    return prismaClient_1.prisma.cartItems.updateMany({
        where: {
            carId,
            active: 1,
        },
        data: {
            active: 0,
            quantity: 0,
        },
    });
}
async function resolveAvailableStock(productId, storeId) {
    const product = await prismaClient_1.prisma.products.findFirst({
        where: { idProduct: BigInt(productId), active: 1 },
        select: { stock: true, providerId: true },
    });
    if (!product) {
        return { stock: 0, found: false };
    }
    const providerId = Number(product.providerId ?? 0);
    if (providerId === 1 || storeId === null) {
        return { stock: Math.max(0, Number(product.stock ?? 0)), found: true };
    }
    const branchStock = await prismaClient_1.prisma.product_stock.findFirst({
        where: {
            productId: BigInt(productId),
            branchId: BigInt(storeId),
        },
        select: { stock: true },
    });
    if (branchStock?.stock != null) {
        return { stock: Math.max(0, Number(branchStock.stock)), found: true };
    }
    return { stock: Math.max(0, Number(product.stock ?? 0)), found: true };
}
//# sourceMappingURL=cart.service.js.map