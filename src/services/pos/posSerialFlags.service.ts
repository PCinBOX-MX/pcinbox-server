import { prisma } from "../../db/prismaClient";

let serialColumnsCache: boolean | null = null;

/** true si `products.requiresSerial` / `warrantyMonths` ya existen en MySQL. */
export async function productsHaveSerialColumns(): Promise<boolean> {
  if (serialColumnsCache != null) return serialColumnsCache;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
      `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = 'requiresSerial'`,
    );
    serialColumnsCache = Number(rows[0]?.c ?? 0) > 0;
  } catch {
    serialColumnsCache = false;
  }
  return serialColumnsCache;
}

export async function getProductSerialFlags(productId: number): Promise<{
  requiresSerial: boolean;
  warrantyMonths: number;
}> {
  const has = await productsHaveSerialColumns();
  if (!has) {
    return { requiresSerial: false, warrantyMonths: 12 };
  }
  const row = await prisma.products.findFirst({
    where: { idProduct: productId },
    select: { requiresSerial: true, warrantyMonths: true },
  });
  return {
    requiresSerial: Boolean(row?.requiresSerial),
    warrantyMonths: row?.warrantyMonths ?? 12,
  };
}
