import { prisma } from "../../db/prismaClient";

/** Proveedores con precio de compra + margen en `products_providers` (TechSmart, DicoTech). */
export const POS_COST_PROVIDER_IDS = [2, 3] as const;

/** IVA que se suma al precio de proveedor para el costo de inversión. */
const POS_COST_IVA_FACTOR = 1.16;

/** Comisión de pagos en línea, sobre el importe cobrado de proveedores 2 y 3. */
export const POS_ONLINE_PAYMENT_FEE_RATE = 0.03;

export type PosUnitCost = {
  /** products_providers.price + 16% IVA */
  costUnit: number;
  /** products_providers.profitMargin */
  profitMarginUnit: number;
  /** products.price */
  catalogPriceUnit: number;
};

export type PosCostSummary = {
  /** Líneas de proveedores 2/3 con costo conocido. */
  lines: number;
  units: number;
  /** Σ (products_providers.price + IVA) × cantidad */
  investment: number;
  /** Cobrado − 3% de comisión − investment (puede ser negativa). */
  profitMargin: number;
  /** Σ importe cobrado (lineTotal) de esas líneas */
  totalCost: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isPosCostProvider(providerId: unknown): boolean {
  return (POS_COST_PROVIDER_IDS as readonly number[]).includes(
    Number(providerId),
  );
}

/** Costos actuales por idProduct (solo proveedores 2/3 con fila en products_providers). */
export async function loadPosUnitCostsByProductIds(
  productIds: number[],
): Promise<Map<number, PosUnitCost>> {
  const ids = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  const out = new Map<number, PosUnitCost>();
  if (ids.length === 0) return out;

  const products = await prisma.products.findMany({
    where: {
      idProduct: { in: ids },
      providerId: { in: [...POS_COST_PROVIDER_IDS] },
      idProductExt: { not: null },
    },
    select: { idProduct: true, idProductExt: true, providerId: true, price: true },
  });
  if (products.length === 0) return out;

  const providerRows = await prisma.products_providers.findMany({
    where: {
      idProductExt: {
        in: [...new Set(products.map((p) => String(p.idProductExt)))],
      },
      providerId: { in: [...POS_COST_PROVIDER_IDS] },
    },
    select: {
      idProductExt: true,
      providerId: true,
      price: true,
      profitMargin: true,
    },
  });
  const byExt = new Map(
    providerRows.map((r) => [`${Number(r.providerId)}|${r.idProductExt}`, r]),
  );

  for (const p of products) {
    const row = byExt.get(`${Number(p.providerId)}|${p.idProductExt}`);
    if (!row || row.price == null) continue;
    out.set(Number(p.idProduct), {
      costUnit: roundMoney((Number(row.price) || 0) * POS_COST_IVA_FACTOR),
      profitMarginUnit: roundMoney(Number(row.profitMargin ?? 0) || 0),
      catalogPriceUnit: roundMoney(Number(p.price) || 0),
    });
  }
  return out;
}

export function summarizePosCosts(
  lines: Array<{
    quantity: number;
    costUnit: number | null;
    profitMarginUnit: number | null;
    lineTotal: number;
  }>,
): PosCostSummary | null {
  let count = 0;
  let units = 0;
  let investment = 0;
  let totalCost = 0;
  for (const line of lines) {
    if (line.costUnit == null) continue;
    const qty = Number(line.quantity) || 0;
    count += 1;
    units += qty;
    investment += Number(line.costUnit) * qty;
    totalCost += Number(line.lineTotal) || 0;
  }
  if (count === 0) return null;
  const roundedInvestment = roundMoney(investment);
  const roundedTotal = roundMoney(totalCost);
  const commission = roundMoney(roundedTotal * POS_ONLINE_PAYMENT_FEE_RATE);
  return {
    lines: count,
    units,
    investment: roundedInvestment,
    profitMargin: roundMoney(roundedTotal - commission - roundedInvestment),
    totalCost: roundedTotal,
  };
}
