import { cacheDel, cacheGetJson, cacheSetJson } from "../infra/redis/cache.util";

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

const memoryCarts = new Map<number, StoredQuoteLine[]>();

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

export async function readAdminQuoteCart(userId: number): Promise<StoredQuoteLine[]> {
  const cached = memoryCarts.get(userId);
  if (cached) return cached.map((line) => ({ ...line }));
  const stored = await cacheGetJson<unknown[]>(cartKey(userId));
  const lines = Array.isArray(stored)
    ? stored
        .map(normalizeStoredQuoteLine)
        .filter((line): line is StoredQuoteLine => Boolean(line))
        .slice(0, QUOTE_CART_MAX_LINES)
    : [];
  memoryCarts.set(userId, lines);
  return lines;
}

export async function writeAdminQuoteCart(
  userId: number,
  lines: StoredQuoteLine[],
): Promise<void> {
  const next = lines.slice(0, QUOTE_CART_MAX_LINES);
  memoryCarts.set(userId, next);
  if (next.length === 0) {
    memoryCarts.delete(userId);
    await cacheDel(cartKey(userId));
    return;
  }
  await cacheSetJson(cartKey(userId), next, CART_TTL_SEC);
}
