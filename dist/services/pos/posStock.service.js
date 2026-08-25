"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrementPosStock = decrementPosStock;
exports.restorePosStock = restorePosStock;
/**
 * Decrementa stock global + por sucursal de forma atómica.
 * Falla si no hay existencia suficiente.
 */
async function decrementPosStock(tx, lines, branchId, userId, refId) {
    for (const line of lines) {
        const productId = Number(line.productId);
        const quantity = Number(line.quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            throw new Error("Producto inválido");
        }
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error("Cantidad inválida");
        }
        const globalUpdated = await tx.products.updateMany({
            where: { idProduct: productId, stock: { gte: quantity }, active: 1 },
            data: { stock: { decrement: quantity } },
        });
        if (globalUpdated.count === 0) {
            throw new Error(`Stock global insuficiente para producto ${productId} (cantidad ${quantity})`);
        }
        const branchRow = await tx.product_stock.findFirst({
            where: { productId, branchId },
            select: { idProductStock: true, stock: true },
        });
        if (!branchRow) {
            throw new Error(`No hay registro de stock en sucursal para producto ${productId}`);
        }
        const branchStock = Number(branchRow.stock ?? 0);
        if (branchStock < quantity) {
            throw new Error(`Stock insuficiente en sucursal para producto ${productId} (disponible ${branchStock}, pedido ${quantity})`);
        }
        await tx.product_stock.update({
            where: { idProductStock: branchRow.idProductStock },
            data: { stock: branchStock - quantity },
        });
        await tx.inventory_movements.create({
            data: {
                productId,
                branchId,
                userId,
                delta: -quantity,
                reason: "pos_sale",
                refType: "pos_sale",
                refId,
                note: `Venta POS ${refId}`,
            },
        });
    }
}
/**
 * Restaura stock global + sucursal al cancelar una venta POS.
 */
async function restorePosStock(tx, lines, branchId, userId, refId) {
    for (const line of lines) {
        const productId = Number(line.productId);
        const quantity = Number(line.quantity);
        if (quantity <= 0)
            continue;
        await tx.products.updateMany({
            where: { idProduct: productId },
            data: { stock: { increment: quantity } },
        });
        const branchRow = await tx.product_stock.findFirst({
            where: { productId, branchId },
            select: { idProductStock: true, stock: true },
        });
        if (branchRow) {
            await tx.product_stock.update({
                where: { idProductStock: branchRow.idProductStock },
                data: { stock: Number(branchRow.stock ?? 0) + quantity },
            });
        }
        else {
            await tx.product_stock.create({
                data: {
                    productId,
                    branchId,
                    stock: quantity,
                },
            });
        }
        await tx.inventory_movements.create({
            data: {
                productId,
                branchId,
                userId,
                delta: quantity,
                reason: "pos_cancel",
                refType: "pos_sale",
                refId,
                note: `Cancelación POS ${refId}`,
            },
        });
    }
}
//# sourceMappingURL=posStock.service.js.map