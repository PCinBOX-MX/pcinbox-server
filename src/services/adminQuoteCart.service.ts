import { cacheDel, cacheGetJson, cacheSetJson } from "../infra/redis/cache.util";
import { normalizeQuoteNumber } from "./quoteLines.service";

export const QUOTE_CART_PAGE_SIZE = 4;
export const QUOTE_CART_MAX_LINES = 100;
const CART_TTL_SEC = 60 * 60 * 24 * 30;

export type StoredQuoteBranch = {
  branchId: number;
  label: string;
  stock: number;
};

export type StoredQuoteLine = {
  idProduct: number;
  name: string;
  description: string | null;
  caracteristicas: unknown;
  price: number;
  image_url: unknown;
  upc: string | null;
  sku: string | null;
  active: boolean;
  stock: number;
  stocksByBranch: StoredQuoteBranch[];
  quantity: number | null;
};

export type QuoteCartPage = {
  data: StoredQuoteLine[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  totalAmount: number;
};

export type ImportedQuoteRef = {
  quoteNumber: string;
  productIds: number[];
};

type StoredCart = {
  lines: StoredQuoteLine[];
  importedQuotes: ImportedQuoteRef[];
};

const QUOTE_NUMBER_PATTERN = /^(?:\d{13}|COT-[A-Z0-9-]{8,55})$/;
const memoryCarts = new Map<number, StoredCart>();

function cartKey(userId: number): string {
  return `admin-quote-cart:v1:${userId}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeStoredQuoteLine(raw: unknown): StoredQuoteLine | null {
  if (!raw || typeof raw !== "object") return null;
  const line = raw as Record<string, unknown>;
  const idProduct = Number(line.idProduct);
  const name = String(line.name || "").trim();
  const price = Number(line.price);
  if (!Number.isSafeInteger(idProduct) || idProduct <= 0 || !name) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  let quantity: number | null = null;
  if (line.quantity !== null && line.quantity !== "" && line.quantity !== undefined) {
    const parsed = Math.round(Number(line.quantity));
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) return null;
    quantity = parsed;
  }

  const stocksByBranch = Array.isArray(line.stocksByBranch)
    ? line.stocksByBranch
        .map((branch) => {
          if (!branch || typeof branch !== "object") return null;
          const item = branch as Record<string, unknown>;
          const branchId = Number(item.branchId);
          const label = String(item.label || "").trim();
          const stock = Number(item.stock);
          if (!Number.isSafeInteger(branchId) || branchId <= 0 || !label) return null;
          return {
            branchId,
            label: label.slice(0, 80),
            stock: Number.isFinite(stock) ? stock : 0,
          };
        })
        .filter((branch): branch is StoredQuoteBranch => Boolean(branch))
        .slice(0, 20)
    : [];

  return {
    idProduct,
    name: name.slice(0, 180),
    description: typeof line.description === "string" ? line.description.slice(0, 4000) : null,
    caracteristicas: line.caracteristicas ?? null,
    price,
    image_url: line.image_url ?? null,
    upc: typeof line.upc === "string" ? line.upc.slice(0, 64) : null,
    sku: typeof line.sku === "string" ? line.sku.slice(0, 64) : null,
    active: line.active === true,
    stock: Number.isFinite(Number(line.stock)) ? Number(line.stock) : 0,
    stocksByBranch,
    quantity,
  };
}

export function quoteCartTotal(lines: StoredQuoteLine[]): number {
  return roundMoney(
    lines.reduce((sum, line) => {
      const quantity = line.quantity ?? 0;
      return sum + line.price * quantity;
    }, 0),
  );
}

export function sliceQuoteCart(
  lines: StoredQuoteLine[],
  requestedPage: number,
  viewAll = false,
): QuoteCartPage {
  const total = lines.length;
  const totalPages = Math.max(1, Math.ceil(total / QUOTE_CART_PAGE_SIZE));
  const page = viewAll
    ? 1
    : Math.min(Math.max(1, Math.trunc(requestedPage) || 1), total === 0 ? 1 : totalPages);
  const start = viewAll ? 0 : (page - 1) * QUOTE_CART_PAGE_SIZE;
  const size = viewAll ? QUOTE_CART_MAX_LINES : QUOTE_CART_PAGE_SIZE;
  return {
    data: lines.slice(start, start + size),
    pagination: {
      page,
      limit: QUOTE_CART_PAGE_SIZE,
      total,
      totalPages: total === 0 ? 0 : totalPages,
    },
    totalAmount: quoteCartTotal(lines),
  };
}

export function upsertQuoteCartLine(
  lines: StoredQuoteLine[],
  incoming: StoredQuoteLine,
): { lines: StoredQuoteLine[]; page: number } | { error: "full" } {
  const index = lines.findIndex((line) => line.idProduct === incoming.idProduct);
  let next = lines;
  if (index >= 0) {
    const current = lines[index];
    if (!current) return { lines, page: 1 };
    const base = current.quantity ?? 0;
    next = lines.map((line, lineIndex) =>
      lineIndex === index
        ? { ...incoming, quantity: Math.min(999, base + 1) }
        : line,
    );
  } else {
    if (lines.length >= QUOTE_CART_MAX_LINES) return { error: "full" };
    next = [...lines, { ...incoming, quantity: incoming.quantity ?? 1 }];
  }
  const placed = next.findIndex((line) => line.idProduct === incoming.idProduct);
  return { lines: next, page: Math.floor(placed / QUOTE_CART_PAGE_SIZE) + 1 };
}

export function mergeQuoteCartLines(
  current: StoredQuoteLine[],
  incoming: StoredQuoteLine[],
): { lines: StoredQuoteLine[]; page: number } | { error: "full" } {
  const next = current.map((line) => ({ ...line }));
  let page = 1;
  for (const line of incoming) {
    const index = next.findIndex((item) => item.idProduct === line.idProduct);
    const add = line.quantity ?? 1;
    if (index >= 0) {
      const existing = next[index];
      if (!existing) continue;
      next[index] = {
        ...existing,
        quantity: Math.min(999, (existing.quantity ?? 0) + add),
      };
      continue;
    }
    if (next.length >= QUOTE_CART_MAX_LINES) return { error: "full" };
    next.push({ ...line, quantity: add });
    page = Math.floor((next.length - 1) / QUOTE_CART_PAGE_SIZE) + 1;
  }
  return { lines: next, page };
}

export function setQuoteCartQuantity(
  lines: StoredQuoteLine[],
  idProduct: number,
  quantity: number | null,
): StoredQuoteLine[] | null {
  const index = lines.findIndex((line) => line.idProduct === idProduct);
  if (index < 0) return null;
  return lines.map((line, lineIndex) =>
    lineIndex === index ? { ...line, quantity } : line,
  );
}

export function removeQuoteCartLine(
  lines: StoredQuoteLine[],
  idProduct: number,
): StoredQuoteLine[] {
  return lines.filter((line) => line.idProduct !== idProduct);
}

function normalizeLines(raw: unknown[]): StoredQuoteLine[] {
  return raw
    .map(normalizeStoredQuoteLine)
    .filter((line): line is StoredQuoteLine => Boolean(line))
    .slice(0, QUOTE_CART_MAX_LINES);
}

function normalizeImportedQuote(raw: unknown): ImportedQuoteRef | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const quoteNumber = normalizeQuoteNumber(item.quoteNumber);
  if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) return null;
  const productIds = [
    ...new Set(
      (Array.isArray(item.productIds) ? item.productIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ].slice(0, QUOTE_CART_MAX_LINES);
  if (productIds.length === 0) return null;
  return { quoteNumber, productIds };
}

function pruneImportedQuotes(
  lines: StoredQuoteLine[],
  quotes: ImportedQuoteRef[],
): ImportedQuoteRef[] {
  const ids = new Set(lines.map((line) => line.idProduct));
  const seen = new Set<string>();
  const next: ImportedQuoteRef[] = [];
  for (const quote of quotes) {
    if (seen.has(quote.quoteNumber)) continue;
    const productIds = quote.productIds.filter((id) => ids.has(id));
    if (productIds.length === 0) continue;
    seen.add(quote.quoteNumber);
    next.push({ quoteNumber: quote.quoteNumber, productIds });
  }
  return next.slice(0, 20);
}

function parseStoredCart(stored: unknown): StoredCart {
  if (Array.isArray(stored)) {
    return { lines: normalizeLines(stored), importedQuotes: [] };
  }
  if (!stored || typeof stored !== "object") {
    return { lines: [], importedQuotes: [] };
  }
  const body = stored as Record<string, unknown>;
  const lines = Array.isArray(body.lines) ? normalizeLines(body.lines) : [];
  const importedQuotes = Array.isArray(body.importedQuotes)
    ? body.importedQuotes
        .map(normalizeImportedQuote)
        .filter((quote): quote is ImportedQuoteRef => Boolean(quote))
    : [];
  return { lines, importedQuotes: pruneImportedQuotes(lines, importedQuotes) };
}

function cloneCart(cart: StoredCart): StoredCart {
  return {
    lines: cart.lines.map((line) => ({ ...line })),
    importedQuotes: cart.importedQuotes.map((quote) => ({
      quoteNumber: quote.quoteNumber,
      productIds: [...quote.productIds],
    })),
  };
}

async function loadCart(userId: number): Promise<StoredCart> {
  const cached = memoryCarts.get(userId);
  if (cached) return cloneCart(cached);
  const stored = await cacheGetJson<unknown>(cartKey(userId));
  const parsed = parseStoredCart(stored);
  memoryCarts.set(userId, parsed);
  return cloneCart(parsed);
}

export async function readAdminQuoteCart(userId: number): Promise<StoredQuoteLine[]> {
  const cart = await loadCart(userId);
  return cart.lines;
}

export function stageAdminQuoteImport(
  userId: number,
  rawQuoteNumber: unknown,
  productIds: number[],
): void {
  const current = memoryCarts.get(userId);
  if (!current) return;
  const quoteNumber = normalizeQuoteNumber(rawQuoteNumber);
  if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) return;
  const ids = [
    ...new Set(productIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ];
  if (ids.length === 0) return;
  current.importedQuotes = [
    ...current.importedQuotes.filter((quote) => quote.quoteNumber !== quoteNumber),
    { quoteNumber, productIds: ids },
  ];
}

export function forgetAdminQuoteImport(userId: number, rawQuoteNumber: unknown): void {
  const current = memoryCarts.get(userId);
  if (!current) return;
  const quoteNumber = normalizeQuoteNumber(rawQuoteNumber);
  current.importedQuotes = current.importedQuotes.filter(
    (quote) => quote.quoteNumber !== quoteNumber,
  );
}

export function listAdminImportedQuoteNumbers(userId: number): string[] {
  return (memoryCarts.get(userId)?.importedQuotes ?? []).map(
    (quote) => quote.quoteNumber,
  );
}

export async function writeAdminQuoteCart(
  userId: number,
  lines: StoredQuoteLine[],
): Promise<void> {
  const current = memoryCarts.get(userId) ?? (await loadCart(userId));
  const nextLines = lines.slice(0, QUOTE_CART_MAX_LINES);
  if (nextLines.length === 0) {
    memoryCarts.delete(userId);
    await cacheDel(cartKey(userId));
    return;
  }
  const next: StoredCart = {
    lines: nextLines,
    importedQuotes: pruneImportedQuotes(nextLines, current.importedQuotes),
  };
  memoryCarts.set(userId, next);
  await cacheSetJson(cartKey(userId), next, CART_TTL_SEC);
}
