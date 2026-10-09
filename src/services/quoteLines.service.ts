export type StoredQuoteLine = {
  productId: string;
  quantity: number;
  storeId: number | null;
  unitPrice?: number | null;
};

export type QuoteLinesPayload = {
  lines: StoredQuoteLine[];
  importedAt: string | null;
  importedByUserId: number | null;
};

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
      if (
        !productId ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1_000 ||
        (storeId !== null &&
          (!Number.isSafeInteger(storeId) || storeId < 0)) ||
        (unitPrice !== null && !Number.isFinite(unitPrice))
      ) {
        throw new Error("invalid");
      }
      return { productId, quantity, storeId, unitPrice };
    });
  } catch {
    return null;
  }
}

/**
 * Lee linesJson: array legacy o `{ lines, importedAt?, importedByUserId? }`.
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
    return { lines, importedAt: null, importedByUserId: null };
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

    return { lines, importedAt, importedByUserId };
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
): {
  lines: StoredQuoteLine[];
  importedAt: string;
  importedByUserId: number;
} {
  return {
    lines,
    importedAt: new Date().toISOString(),
    importedByUserId: userId,
  };
}
