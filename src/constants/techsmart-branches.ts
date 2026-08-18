import { prisma } from "../db/prismaClient";

import { TECHSMART_PROVIDER_ID } from "@pcinbox/core";

export { TECHSMART_PROVIDER_ID };

export const TECHSMART_DISABLED_BRANCH_NAMES = [] as const;

export function normalizeBranchName(name?: string | null): string {
  return String(name || "").trim().toUpperCase();
}

export function isTechSmartBranchDisabled(
  branchName?: string | null,
): boolean {
  return (TECHSMART_DISABLED_BRANCH_NAMES as readonly string[]).includes(
    normalizeBranchName(branchName),
  );
}

export async function getTechSmartBranchValidationError(
  providerId: number | null | undefined,
  storeId: number | null,
): Promise<string | null> {
  if (Number(providerId) !== TECHSMART_PROVIDER_ID || storeId == null) {
    return null;
  }

  const branch = await prisma.branches.findFirst({
    where: { idBranche: storeId },
    select: { name: true },
  });

  if (isTechSmartBranchDisabled(branch?.name)) {
    return "Hay una sucursal no disponible para productos TechSmart.";
  }

  return null;
}
