import { Prisma } from "@prisma/client";

export type PosStockLine = {
  productId: number;
  quantity: number;
  /** Bodega de origen; si falta, solo se mueve stock global (p.ej. PCinbox sin product_stock). */
  branchId?: number | null;
};

/**
 * Decrementa stock global + por bodega (si hay branchId) de forma atómica.
 */
export async function decrementPosStock(
  tx: Prisma.TransactionClient,
  lines: PosStockLine[],
  userId: number,
  refId: string,
) {
  for (const line of lines) {
    const productId = Number(line.productId);
    const quantity = Number(line.quantity);
    const branchId =
      line.branchId != null && Number.isSafeInteger(Number(line.branchId))
        ? Number(line.branchId)
        : null;

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
      throw new Error(
        `Stock global insuficiente para producto ${productId} (cantidad ${quantity})`,
      );
    }

    if (branchId != null) {
      const branchUpdated = await tx.product_stock.updateMany({
        where: {
          productId,
          branchId,
          stock: { gte: quantity },
        },
        data: { stock: { decrement: quantity } },
      });

      if (branchUpdated.count === 0) {
        const branchRow = await tx.product_stock.findFirst({
          where: { productId, branchId },
          select: { idProductStock: true, stock: true },
        });
        if (!branchRow) {
          throw new Error(
            `No hay registro de stock en bodega ${branchId} para producto ${productId}`,
          );
        }
        throw new Error(
          `Stock insuficiente en bodega para producto ${productId} (disponible ${Number(branchRow.stock ?? 0)}, pedido ${quantity})`,
        );
      }
    }

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
 * Restaura stock global + bodega al cancelar una venta POS.
 */
export async function restorePosStock(
  tx: Prisma.TransactionClient,
  lines: PosStockLine[],
  userId: number,
  refId: string,
) {
  for (const line of lines) {
    const productId = Number(line.productId);
    const quantity = Number(line.quantity);
    const branchId =
      line.branchId != null && Number.isSafeInteger(Number(line.branchId))
        ? Number(line.branchId)
        : null;
    if (quantity <= 0) continue;

    await tx.products.updateMany({
      where: { idProduct: productId },
      data: { stock: { increment: quantity } },
    });

    if (branchId != null) {
      const branchRow = await tx.product_stock.findFirst({
        where: { productId, branchId },
        select: { idProductStock: true, stock: true },
      });

      if (branchRow) {
        await tx.product_stock.update({
          where: { idProductStock: branchRow.idProductStock },
          data: { stock: Number(branchRow.stock ?? 0) + quantity },
        });
      } else {
        await tx.product_stock.create({
          data: {
            productId,
            branchId,
            stock: quantity,
          },
        });
      }
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
