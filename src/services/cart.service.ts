import { prisma } from "../db/prismaClient";

export function normalizeStoreId(storeId: unknown): number | null {
  if (storeId === null || storeId === undefined || storeId === "") return null;
  const parsed = Number(storeId);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function getOrCreateActiveCart(userId: number) {
  const existing = await prisma.carts.findFirst({
    where: {
      userId,
      status: "active",
    },
    orderBy: { idCart: "desc" },
  });

  if (existing) return existing;

  return prisma.carts.create({
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
export async function consolidateActiveCartItems(
  userId: number,
  activeCartId: bigint,
) {
  const misplaced = await prisma.cartItems.findMany({
    where: {
      active: 1,
      carId: { not: activeCartId },
      carts: { userId },
    },
  });

  for (const item of misplaced) {
    const storeId = item.storeId ?? null;

    const existingOnActive = await prisma.cartItems.findFirst({
      where: {
        carId: activeCartId,
        productId: item.productId,
        storeId,
        active: 1,
      },
    });

    if (existingOnActive) {
      await prisma.cartItems.update({
        where: { idCartItem: existingOnActive.idCartItem },
        data: {
          quantity: Math.max(
            Number(existingOnActive.quantity ?? 0),
            Number(item.quantity ?? 0),
          ),
        },
      });
      await prisma.cartItems.update({
        where: { idCartItem: item.idCartItem },
        data: { active: 0, quantity: 0 },
      });
    } else {
      await prisma.cartItems.update({
        where: { idCartItem: item.idCartItem },
        data: { carId: activeCartId },
      });
    }
  }
}

export async function findActiveCartItem(
  carId: bigint,
  productId: number,
  storeId: number | null,
) {
  return prisma.cartItems.findFirst({
    where: {
      carId,
      productId,
      storeId,
      active: 1,
    },
  });
}

/**
 * Une líneas duplicadas del mismo producto (p. ej. storeId null vs sucursal)
 * para que addProduct y getCart vean la misma cantidad.
 */
export async function mergeDuplicateCartLines(
  carId: bigint,
  productId: number,
  storeId: number | null,
) {
  const lines = await prisma.cartItems.findMany({
    where: {
      carId,
      productId,
      storeId,
      active: 1,
    },
    orderBy: { idCartItem: "asc" },
  });

  if (lines.length <= 1) {
    return lines[0] ?? null;
  }

  const totalQty = lines.reduce(
    (sum, line) => sum + Number(line.quantity ?? 0),
    0,
  );

  const keeper = lines[0];

  await prisma.cartItems.update({
    where: { idCartItem: keeper!.idCartItem },
    data: {
      quantity: totalQty,
    },
  });

  const toDeactivate = lines.slice(1);

  await prisma.cartItems.updateMany({
    where: {
      idCartItem: { in: toDeactivate.map((line) => line.idCartItem) },
    },
    data: { active: 0, quantity: 0 },
  });

  return prisma.cartItems.findFirst({
    where: { idCartItem: keeper!.idCartItem },
  });
}

export async function deactivateAllActiveCartItems(carId: bigint) {
  return prisma.cartItems.updateMany({
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

export async function resolveAvailableStock(
  productId: number,
  storeId: number | null,
): Promise<{ stock: number; found: boolean }> {
  const product = await prisma.products.findFirst({
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

  const branchStock = await prisma.product_stock.findFirst({
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
