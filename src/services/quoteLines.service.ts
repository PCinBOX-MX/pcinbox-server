export type StoredQuoteLine = {
  productId: string;
  quantity: number;
  storeId: number | null;
  unitPrice?: number | null;
  /** Producto capturado sin catálogo. El precio cobrable vive en el PDF. */
  manual?: boolean;
  name?: string;
  upc?: string | null;
};

export type StoredQuoteDelivery = {
  street: string;
  noExt: string;
  noInt: string | null;
  postalCode: string;
  cologne: string;
  city: string;
  state: string;
  country: string;
  shippingCost: number;
};

export type QuoteLinesPayload = {
  lines: StoredQuoteLine[];
  importedAt: string | null;
  importedByUserId: number | null;
  /** Equipos iguales. 1 en cotizaciones guardadas antes de este dato. */
  equipmentCount: number;
  /** Precio de ensamble de un equipo. Null si no se cobró. */
  assemblyPrice: number | null;
  /** Domicilios de envío. Vacío si la cotización no los trae. */
  deliveries: StoredQuoteDelivery[];
};

/** Lo que puede verse en el PDF: sin calle ni número. */
export function quotePublicShippingLabel(row: {
  postalCode: string;
  cologne: string;
  city: string;
  state: string;
}): string {
  const city = [row.city, row.state]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  return [
    row.postalCode.trim() ? `CP ${row.postalCode.trim()}` : "",
    row.cologne.trim() ? `Col. ${row.cologne.trim()}` : "",
    city,
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 80);
}

export function normalizeEquipmentCount(raw: unknown): number {
  const count = Math.round(Number(raw));
  if (!Number.isInteger(count) || count < 1) return 1;
  return Math.min(999, count);
}

export const QUOTE_NUMBER_PATTERN = /^(?:\d{13}|COT-[A-Z0-9-]{8,55})$/;

export function normalizeQuoteNumber(raw: unknown): string {
  return String(raw || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseJsonValue(raw: unknown): unknown {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function parseLinesArray(value: unknown): StoredQuoteLine[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    return null;
  }
  try {
    return value.map((rawLine) => {
      if (!rawLine || typeof rawLine !== "object") {
        throw new Error("invalid");
      }
      const line = rawLine as Record<string, unknown>;
      const productId = String(line.productId ?? "").trim();
      const quantityRaw = Number(line.quantity);
      const quantity = Number.isFinite(quantityRaw)
        ? Math.round(quantityRaw)
        : NaN;
      const storeId =
        line.storeId === null ||
        line.storeId === undefined ||
        line.storeId === ""
          ? null
          : Number(line.storeId);
      const unitPriceRaw =
        line.unitPrice === null ||
        line.unitPrice === undefined ||
        line.unitPrice === ""
          ? null
          : Number(line.unitPrice);
      const unitPrice =
        unitPriceRaw === null
          ? null
          : Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0
            ? roundMoney(unitPriceRaw)
            : NaN;
      const manual = line.manual === true;
      const name = String(line.name ?? "").trim().slice(0, 180);
      const upcRaw = String(line.upc ?? "").trim().slice(0, 32);
      if (
        !productId ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1_000 ||
        (storeId !== null &&
          (!Number.isSafeInteger(storeId) || storeId < 0)) ||
        (unitPrice !== null && !Number.isFinite(unitPrice)) ||
        (manual && name.length < 2)
      ) {
        throw new Error("invalid");
      }
      return {
        productId,
        quantity,
        storeId,
        unitPrice,
        ...(manual ? { manual: true, name, upc: upcRaw || null } : {}),
      };
    });
  } catch {
    return null;
  }
}

/**
 * Lee linesJson: array legacy o `{ lines, equipmentCount?, importedAt?, importedByUserId? }`.
 * POS / checkout siguen usando solo las líneas vía `parseStoredQuoteLines`.
 */
export function readStoredQuoteLinesPayload(
  raw: unknown,
): QuoteLinesPayload | null {
  const value = parseJsonValue(raw);
  if (value == null) return null;

  if (Array.isArray(value)) {
    const lines = parseLinesArray(value);
    if (!lines) return null;
    return {
      lines,
      importedAt: null,
      importedByUserId: null,
      equipmentCount: 1,
      assemblyPrice: null,
      deliveries: [],
    };
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const lines = parseLinesArray(obj.lines);
    if (!lines) return null;

    const importedAt =
      typeof obj.importedAt === "string" && obj.importedAt.trim()
        ? obj.importedAt.trim()
        : null;
    const importedByRaw = Number(obj.importedByUserId);
    const importedByUserId =
      Number.isSafeInteger(importedByRaw) && importedByRaw > 0
        ? importedByRaw
        : null;

    const assemblyPrice = readAssemblyPrice(obj.assemblyPrice);
    if (assemblyPrice === undefined) return null;
    const deliveries = parseQuoteDeliveries(obj.deliveries);
    if (!deliveries) return null;

    return {
      lines,
      importedAt,
      importedByUserId,
      equipmentCount: normalizeEquipmentCount(obj.equipmentCount),
      assemblyPrice,
      deliveries,
    };
  }

  return null;
}

/** Parsea linesJson de cotizaciones (checkoutContext / POS). */
export function parseStoredQuoteLines(
  raw: unknown,
): StoredQuoteLine[] | null {
  return readStoredQuoteLinesPayload(raw)?.lines ?? null;
}

/** Marca linesJson como ya importada (sin columnas nuevas). */
export function buildImportedLinesJson(
  lines: StoredQuoteLine[],
  userId: number,
  equipmentCount = 1,
  assemblyPrice: number | null = null,
  deliveries: StoredQuoteDelivery[] = [],
): {
  lines: StoredQuoteLine[];
  importedAt: string;
  importedByUserId: number;
  equipmentCount?: number;
  assemblyPrice?: number;
  deliveries?: StoredQuoteDelivery[];
} {
  const count = normalizeEquipmentCount(equipmentCount);
  const assembly = readAssemblyPrice(assemblyPrice);
  const saved = parseQuoteDeliveries(deliveries) ?? [];
  return {
    lines,
    importedAt: new Date().toISOString(),
    importedByUserId: userId,
    ...(count > 1 ? { equipmentCount: count } : {}),
    ...(assembly ? { assemblyPrice: assembly } : {}),
    ...(saved.length ? { deliveries: saved } : {}),
  };
}

/** Null si el arreglo trae un domicilio incompleto. Vacío si no hay envíos. */
export function parseQuoteDeliveries(raw: unknown): StoredQuoteDelivery[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 10) return null;
  const out: StoredQuoteDelivery[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const street = String(row.street ?? "").trim().slice(0, 255);
    const noExt = String(row.noExt ?? "").trim().slice(0, 10);
    const noInt = String(row.noInt ?? "").trim().slice(0, 10);
    const postalCode = String(row.postalCode ?? "").replace(/\D/g, "").slice(0, 5);
    const cologne = String(row.cologne ?? "").trim().slice(0, 100);
    const city = String(row.city ?? "").trim().slice(0, 100);
    const state = String(row.state ?? "").trim().slice(0, 100);
    const country = String(row.country ?? "").trim().slice(0, 100) || "México";
    const cost = Number(row.shippingCost);
    if (
      !street ||
      !noExt ||
      !/^\d{5}$/.test(postalCode) ||
      !cologne ||
      !city ||
      !state ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      cost > 999999.99
    ) {
      return null;
    }
    out.push({
      street,
      noExt,
      noInt: noInt || null,
      postalCode,
      cologne,
      city,
      state,
      country,
      shippingCost: roundMoney(cost),
    });
  }
  return out;
}

/** Null = no se cobra. Undefined = el valor guardado no es usable. */
function readAssemblyPrice(raw: unknown): number | null | undefined {
  if (raw == null || raw === "") return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
    return undefined;
  }
  return roundMoney(amount);
}
