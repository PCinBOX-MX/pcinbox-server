import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";

/** SKU fijo del producto comodín para líneas capturadas a mano en POS. */
export const POS_MANUAL_PRODUCT_SKU = "__POS_MANUAL__";

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function ensurePosManualProduct(tx: DbClient = prisma) {
  const existing = await tx.products.findFirst({
    where: { sku: POS_MANUAL_PRODUCT_SKU },
    select: {
      idProduct: true,
      name: true,
      price: true,
      sku: true,
      upc: true,
      stock: true,
      providerId: true,
      warrantyMonths: true,
      requiresSerial: true,
    },
  });
  if (existing) return existing;

  const provider = await tx.providers.findFirst({
    orderBy: { idProvider: "asc" },
    select: { idProvider: true },
  });
  if (!provider) {
    throw new Error(
      "No hay proveedores en catálogo para crear el producto manual POS",
    );
  }

  return tx.products.create({
    data: {
      name: "Producto manual POS",
      description: "Línea capturada manualmente en Punto de Venta",
      price: 0,
      stock: 999999,
      sku: POS_MANUAL_PRODUCT_SKU,
      providerId: provider.idProvider,
      active: 1,
      requiresSerial: false,
      warrantyMonths: 12,
    },
    select: {
      idProduct: true,
      name: true,
      price: true,
      sku: true,
      upc: true,
      stock: true,
      providerId: true,
      warrantyMonths: true,
      requiresSerial: true,
    },
  });
}
