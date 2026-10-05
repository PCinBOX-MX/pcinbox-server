export type StoredQuoteLine = {
  productId: string;
  quantity: number;
  storeId: number | null;
  unitPrice?: number | null;
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

/** Parsea linesJson de cotizaciones (checkoutContext / POS). */
export function parseStoredQuoteLines(
  raw: unknown,
): StoredQuoteLine[] | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
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
