import { prisma } from "../db/prismaClient";

/** Sucursal física donde el cliente recoge (PCinBOX-León), distinta de la sucursal de compra/stock. */
export const PCINBOX_PICKUP_BRANCH_NAME = "leon2";

let cachedPickupBranchId: number | null | undefined;

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

export function isPickupShippingMethod(method?: string | null): boolean {
  const normalized = String(method ?? "").toLowerCase();
  return normalized === "sucursal" || normalized === "sucursalext";
}
