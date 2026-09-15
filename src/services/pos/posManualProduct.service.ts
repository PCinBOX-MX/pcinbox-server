import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";

/** SKU comodín: producto capturado a mano en POS. */
export const POS_MANUAL_PRODUCT_SKU = "__POS_MANUAL__";
/** SKU comodín: servicio adicional capturado en POS. */
export const POS_MANUAL_SERVICE_SKU = "__POS_SERVICE__";

export type PosManualKind = "product" | "service";

type DbClient = typeof prisma | Prisma.TransactionClient;

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
} as const;

async function ensurePlaceholder(
  tx: DbClient,
  kind: PosManualKind,
) {
  const sku =
    kind === "service" ? POS_MANUAL_SERVICE_SKU : POS_MANUAL_PRODUCT_SKU;
  const existing = await tx.products.findFirst({
    where: { sku },
    select: SELECT,
  });
  if (existing) return existing;

  const provider = await tx.providers.findFirst({
    orderBy: { idProvider: "asc" },
    select: { idProvider: true },
  });
  if (!provider) {
    throw new Error(
      "No hay proveedores en catálogo para crear el producto/servicio manual POS",
    );
  }

  return tx.products.create({
    data: {
      name:
        kind === "service"
          ? "Servicio adicional POS"
          : "Producto manual POS",
      description:
        kind === "service"
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
export async function ensurePosManualProduct(tx: DbClient = prisma) {
  return ensurePlaceholder(tx, "product");
}

export async function ensurePosManualLineProduct(
  kind: PosManualKind = "product",
  tx: DbClient = prisma,
) {
  return ensurePlaceholder(tx, kind === "service" ? "service" : "product");
}

/** IDs de comodines que no deben tocar inventario. */
export async function getPosManualPlaceholderIds(
  tx: DbClient = prisma,
): Promise<number[]> {
  const rows = await tx.products.findMany({
    where: {
      sku: { in: [POS_MANUAL_PRODUCT_SKU, POS_MANUAL_SERVICE_SKU] },
    },
    select: { idProduct: true },
  });
  return rows.map((r) => Number(r.idProduct));
}
