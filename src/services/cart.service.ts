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
  if (storeId === null) {
    return prisma.cartItems.findFirst({
      where: {
        carId,
        productId,
        storeId: null,
        active: 1,
      },
    });
  }

  return prisma.cartItems.findFirst({
    where: {
      carId,
      productId,
      storeId,
      active: 1,
    },
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
