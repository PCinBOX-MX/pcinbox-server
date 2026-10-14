import { Prisma } from "@prisma/client";

/** Solo el catálogo propio (providerId=1) mueve stock en DB al vender/cancelar POS. */
export const POS_STOCK_PROVIDER_ID = 1;

export type PosStockLine = {
  productId: number;
  quantity: number;
  /** Bodega de origen; si falta, solo se mueve stock global (p.ej. PCinbox sin product_stock). */
  branchId?: number | null;
};

async function filterOwnedStockLines(
  tx: Prisma.TransactionClient,
  lines: PosStockLine[],
): Promise<PosStockLine[]> {
  const ids = [
    ...new Set(
      lines
        .map((l) => Number(l.productId))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  if (ids.length === 0) return [];
  const owned = await tx.products.findMany({
    where: { idProduct: { in: ids }, providerId: POS_STOCK_PROVIDER_ID },
    select: { idProduct: true },
  });
  const ownedSet = new Set(owned.map((p) => Number(p.idProduct)));
  return lines.filter((l) => ownedSet.has(Number(l.productId)));
}

/**
 * Decrementa stock global + por bodega (si hay branchId) de forma atómica.
 * Ignora productos que no sean providerId=1.
 */
export async function decrementPosStock(
  tx: Prisma.TransactionClient,
  lines: PosStockLine[],
  userId: number,
  refId: string,
) {
  const ownedLines = await filterOwnedStockLines(tx, lines);
  for (const line of ownedLines) {
    const productId = Number(line.productId);
    const quantity = Number(line.quantity);
    const branchId =
      line.branchId != null && Number.isSafeInteger(Number(line.branchId))
        ? Number(line.branchId)
        : null;

    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new Error(
        "No se pudo descontar el stock porque un producto no tiene identificador válido. Quita esa línea y agrégala de nuevo. Si la venta viene de un folio, quita el folio e impórtalo otra vez. Si se repite, reporta a soporte el folio y la hora.",
      );
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(
        "No se pudo descontar el stock porque una línea tiene una cantidad inválida. Revisa las cantidades del carrito y vuelve a cobrar. Si se repite, reporta a soporte el folio o el nombre del producto.",
      );
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
 * Solo providerId=1 (mismo criterio que el descuento).
 */
export async function restorePosStock(
  tx: Prisma.TransactionClient,
  lines: PosStockLine[],
  userId: number,
  refId: string,
) {
  const ownedLines = await filterOwnedStockLines(tx, lines);
  for (const line of ownedLines) {
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
