/**
 * Etiquetas de bodega PCinBOX alineadas con pcinbox-client
 * (`getBranchDisplayName` / gridConfirmaProductos).
 */

export const PCINBOX_PROVIDER_ID = 1;
export const TECHSMART_PROVIDER_ID = 2;
export const DICOTECH_PROVIDER_ID = 3;

/** Bodegas vendibles por proveedor (nombres crudos en BD). */
const POS_ALLOWED_BRANCH_NAMES: Record<number, readonly string[]> = {
  [PCINBOX_PROVIDER_ID]: ["leon", "leon2", "león"],
  [TECHSMART_PROVIDER_ID]: ["cdmx", "gdl"],
  [DICOTECH_PROVIDER_ID]: ["leon2", "santafe"],
};

export function normalizePosBranchKey(rawName?: string | null): string {
  return String(rawName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function isPosSellableBranchName(
  providerId: number,
  branchName?: string | null,
): boolean {
  const allowed = POS_ALLOWED_BRANCH_NAMES[providerId];
  if (!allowed) {
    // Proveedores desconocidos: no listar bodegas arbitrarias en POS.
    return false;
  }
  const key = normalizePosBranchKey(branchName);
  if (!key) return false;
  return allowed.some((a) => normalizePosBranchKey(a) === key);
}

export function formatPcinboxBranchDisplayName(
  rawName?: string | null | undefined,
): string | null {
  const name = String(rawName ?? "").trim();
  if (!name) return null;
  const key = normalizePosBranchKey(name);

  if (key === "leon2" || key === "león" || key === "leon") {
    return "PCinBOX-León";
  }
  if (key === "santafe" || key === "santafe.") {
    return "PCinBOX-SFD";
  }
  if (key === "gdl") {
    return "PCinBOX-GDL";
  }
  if (key === "cdmx") {
    return "PCinBOX-CDMX";
  }
  if (key === "dicoags2") {
    return "PCinBOX-AG2D";
  }
  if (key === "arboledas") {
    return "PCinBOX-AGD";
  }

  return name;
}

/** Fallback de ticket cuando no hay bodega en la línea (p. ej. manual / stock global). */
export const POS_TICKET_BRANCH_FALLBACK = "PCinBOX-León";

export function resolveTicketBranchLabel(params: {
  itemBranchName?: string | null | undefined;
  saleBranchName?: string | null | undefined;
}): string {
  return (
    formatPcinboxBranchDisplayName(params.itemBranchName) ||
    formatPcinboxBranchDisplayName(params.saleBranchName) ||
    POS_TICKET_BRANCH_FALLBACK
  );
}
