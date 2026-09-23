/**
 * Resolución de garantía POS por proveedor / isPC / catálogo / cajero.
 * Modes: months | none | service_center
 */

export type WarrantyMode = "months" | "none" | "service_center";

export type ResolvedWarranty = {
  warrantyMode: WarrantyMode | null;
  warrantyMonths: number | null;
};

const PROVIDER_TECHSMART = 2;
const PROVIDER_PCINBOX = 1;

export function parseWarrantyMode(
  raw: unknown,
): WarrantyMode | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "months" || v === "mes" || v === "meses") return "months";
  if (v === "years" || v === "year" || v === "años" || v === "ano" || v === "anos")
    return "months"; // duración viene en clientUnit/months
  if (v === "none" || v === "no_aplica" || v === "na") return "none";
  if (
    v === "service_center" ||
    v === "centro" ||
    v === "centro_servicio" ||
    v === "servicio"
  ) {
    return "service_center";
  }
  return null;
}

export function fromCatalogWarranty(
  mode: unknown,
  months: unknown,
): ResolvedWarranty {
  const parsed = parseWarrantyMode(mode);
  if (parsed === "none") {
    return { warrantyMode: "none", warrantyMonths: null };
  }
  if (parsed === "service_center") {
    return { warrantyMode: "service_center", warrantyMonths: null };
  }
  const n =
    months != null && Number.isFinite(Number(months)) && Number(months) > 0
      ? Math.round(Number(months))
      : null;
  if (n != null) {
    return { warrantyMode: "months", warrantyMonths: n };
  }
  return { warrantyMode: null, warrantyMonths: null };
}

/**
 * Normaliza elección del cajero (solo componentes PCinBOX).
 * clientUnit: "months" | "years" cuando mode es months.
 */
export function fromCashierWarranty(input: {
  warrantyMode?: unknown;
  warrantyMonths?: unknown;
  warrantyUnit?: unknown;
}): ResolvedWarranty {
  const modeRaw = String(input.warrantyMode || "")
    .trim()
    .toLowerCase();
  if (modeRaw === "none" || modeRaw === "no_aplica" || modeRaw === "na") {
    return { warrantyMode: "none", warrantyMonths: null };
  }
  if (
    modeRaw === "service_center" ||
    modeRaw === "centro" ||
    modeRaw === "centro_servicio"
  ) {
    return { warrantyMode: "service_center", warrantyMonths: null };
  }

  const unit = String(input.warrantyUnit || modeRaw || "months")
    .trim()
    .toLowerCase();
  let n = Number(input.warrantyMonths);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Indica la duración de la garantía (meses o años)");
  }
  n = Math.round(n);
  if (unit === "years" || unit === "year" || unit === "años" || unit === "anos") {
    n = n * 12;
  }
  if (n > 1200) {
    throw new Error("Duración de garantía inválida");
  }
  return { warrantyMode: "months", warrantyMonths: n };
}

/**
 * Reglas:
 * - TechSmart (2) → 12 meses fijo
 * - PCinBOX (1) + isPC → 12 meses fijo
 * - PCinBOX (1) + !isPC → cajero (obligatorio)
 * - Resto (DicoTech, etc.) → catálogo
 */
export function resolvePosLineWarranty(params: {
  providerId: number | null | undefined;
  isPC: boolean;
  catalogMode?: unknown;
  catalogMonths?: unknown;
  clientMode?: unknown;
  clientMonths?: unknown;
  clientUnit?: unknown;
  /** Si true y es componente PCinBOX sin elección → error */
  requireCashierChoice?: boolean;
}): ResolvedWarranty {
  const providerId = Number(params.providerId);
  const isPC = Boolean(params.isPC);

  if (providerId === PROVIDER_TECHSMART) {
    return { warrantyMode: "months", warrantyMonths: 12 };
  }
  if (providerId === PROVIDER_PCINBOX && isPC) {
    return { warrantyMode: "months", warrantyMonths: 12 };
  }

  if (providerId === PROVIDER_PCINBOX && !isPC) {
    const hasChoice =
      params.clientMode != null && String(params.clientMode).trim() !== "";
    if (!hasChoice) {
      if (params.requireCashierChoice !== false) {
        throw new Error(
          "Elige la garantía del componente PCinBOX (meses, años, no aplica o centro de servicio)",
        );
      }
      return { warrantyMode: null, warrantyMonths: null };
    }
    return fromCashierWarranty({
      warrantyMode: params.clientMode,
      warrantyMonths: params.clientMonths,
      warrantyUnit: params.clientUnit,
    });
  }

  return fromCatalogWarranty(params.catalogMode, params.catalogMonths);
}

export function warrantyCoverageLabel(
  mode: unknown,
  months: unknown,
): string {
  const m = parseWarrantyMode(mode);
  if (m === "none") return "No aplica";
  if (m === "service_center") return "Centro de servicio";
  const n =
    months != null && Number.isFinite(Number(months)) && Number(months) > 0
      ? Number(months)
      : null;
  if (n != null) {
    if (n >= 12 && n % 12 === 0) {
      const y = n / 12;
      return `${y} año${y === 1 ? "" : "s"}`;
    }
    return `${n} mes${n === 1 ? "" : "es"}`;
  }
  return "Según marca / servicio";
}

/** ¿El cajero debe elegir garantía en cobro? */
export function posWarrantySelectable(params: {
  providerId?: number | null;
  isPC?: boolean | number | null;
}): boolean {
  return (
    Number(params.providerId) === PROVIDER_PCINBOX &&
    !(Number(params.isPC) === 1)
  );
}
