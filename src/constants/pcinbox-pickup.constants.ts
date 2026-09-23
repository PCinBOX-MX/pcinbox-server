import { prisma } from "../db/prismaClient";

/** Sucursal física donde el cliente recoge (PCinBOX-León), distinta de la sucursal de compra/stock. */
export const PCINBOX_PICKUP_BRANCH_NAME = "leon2";

/** Provider id de catálogo propio PCinBOX. */
export const PCINBOX_PROVIDER_ID = 1;

let cachedPickupBranchId: number | null | undefined;
let cachedPosCashBranchId: number | null | undefined;

export async function resolvePcinboxPickupBranchId(): Promise<number | null> {
  if (cachedPickupBranchId !== undefined) {
    return cachedPickupBranchId;
  }

  const branch = await prisma.branches.findFirst({
    where: { name: PCINBOX_PICKUP_BRANCH_NAME },
    select: { idBranche: true },
  });

  cachedPickupBranchId = branch ? Number(branch.idBranche) : null;
  return cachedPickupBranchId;
}

/**
 * Sucursal de caja POS (fija, no se elige en UI).
 * 1) Primera branch con `providerId = 1` (catálogo PCinBOX).
 * 2) Si no existe en BD (caso actual: no hay branches con provider 1),
 *    usa la sucursal de recolección `leon2` (tienda física PCinBOX-León).
 */
export async function resolvePosCashBranchId(): Promise<number | null> {
  if (cachedPosCashBranchId !== undefined) {
    return cachedPosCashBranchId;
  }

  const byProvider = await prisma.branches.findFirst({
    where: { providerId: PCINBOX_PROVIDER_ID },
    orderBy: { idBranche: "asc" },
    select: { idBranche: true },
  });
  if (byProvider) {
    cachedPosCashBranchId = Number(byProvider.idBranche);
    return cachedPosCashBranchId;
  }

  cachedPosCashBranchId = await resolvePcinboxPickupBranchId();
  return cachedPosCashBranchId;
}

export function isPickupShippingMethod(method?: string | null): boolean {
  const normalized = String(method ?? "").toLowerCase();
  return normalized === "sucursal" || normalized === "sucursalext";
}
