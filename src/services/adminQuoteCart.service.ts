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
  manual?: boolean;
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
    manual: line.manual === true,
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
    const add = Math.max(1, incoming.quantity ?? 1);
    // Conservar la línea existente (precio/notas/manual/importada).
    // Solo sumar cantidad: no sobrescribir con datos frescos del catálogo.
    next = lines.map((line, lineIndex) =>
      lineIndex === index
        ? { ...current, quantity: Math.min(999, base + add) }
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

export type LiveQuoteUpdate = {
  idProduct: number;
  price?: number;
  stock?: number;
  active?: 0 | 1;
  branches?: Record<string, number>;
};

const DISPLAY_KEYS: Record<string, readonly string[]> = {
  "pcinbox-gdl": ["gdl"],
  "pcinbox-cdmx": ["cdmx"],
  "pcinbox-sfd": ["santafe"],
  "pcinbox-leon": ["leon2", "leon"],
  "pcinbox-ag2d": ["dicoags2"],
  "pcinbox-agd": ["arboledas"],
};

function liveNorm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function matchLiveBranchStock(
  label: string,
  branchId: number,
  branches: Record<string, number>,
): number | null {
  const labelKey = liveNorm(label);
  const aliases = DISPLAY_KEYS[labelKey] ?? [];
  const idKey = String(branchId);
  for (const [rawKey, qty] of Object.entries(branches)) {
    const key = liveNorm(rawKey);
    if (!key) continue;
    const hit =
      key === labelKey ||
      key === idKey ||
      aliases.includes(key) ||
      (key.length >= 3 && (labelKey.includes(key) || key.includes(labelKey)));
    if (!hit) continue;
    return Math.max(0, Number(qty) || 0);
  }
  return null;
}

export function normalizeLiveQuoteUpdates(raw: unknown): LiveQuoteUpdate[] {
  if (!Array.isArray(raw)) return [];
  const next: LiveQuoteUpdate[] = [];
  for (const row of raw.slice(0, 400)) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const idProduct = Number(item.idProduct);
    if (!Number.isSafeInteger(idProduct) || idProduct <= 0) continue;
    const price = item.price == null ? undefined : Number(item.price);
    const stock = item.stock == null ? undefined : Number(item.stock);
    const activeRaw = item.active == null ? undefined : Number(item.active);
    let branches: Record<string, number> | undefined;
    if (item.branches && typeof item.branches === "object" && !Array.isArray(item.branches)) {
      branches = {};
      for (const [key, value] of Object.entries(item.branches as Record<string, unknown>)) {
        const qty = Number(value);
        if (!key.trim() || !Number.isFinite(qty)) continue;
        branches[key.slice(0, 80)] = Math.max(0, qty);
      }
    }
    const update: LiveQuoteUpdate = { idProduct };
    if (price != null && Number.isFinite(price) && price >= 0) update.price = price;
    if (stock != null && Number.isFinite(stock)) update.stock = Math.max(0, stock);
    if (activeRaw === 0 || activeRaw === 1) update.active = activeRaw;
    if (branches && Object.keys(branches).length > 0) update.branches = branches;
    next.push(update);
  }
  return next;
}

function patchStoredLiveLine(
  line: StoredQuoteLine,
  update: LiveQuoteUpdate,
): StoredQuoteLine {
  // Productos manuales: no pisar precio/activo con sync del cron.
  if (line.manual === true) {
    return line;
  }

  let price = line.price;
  let stock = line.stock;
  let active = line.active;
  let stocksByBranch = line.stocksByBranch;
  let touched = false;

  if (update.price != null && update.price !== price) {
    price = Math.round((update.price + Number.EPSILON) * 100) / 100;
    touched = true;
  }
  if (update.active != null) {
    const nextActive = update.active === 1;
    if (nextActive !== active) {
      active = nextActive;
      touched = true;
    }
  }
  if (update.branches && Object.keys(update.branches).length > 0 && stocksByBranch.length > 0) {
    let branchChanged = false;
    const nextBranches = stocksByBranch.map((branch) => {
      const nextStock = matchLiveBranchStock(branch.label, branch.branchId, update.branches!);
      if (nextStock == null || nextStock === branch.stock) return branch;
      branchChanged = true;
      return { ...branch, stock: nextStock };
    });
    if (branchChanged) {
      stocksByBranch = nextBranches;
      stock = nextBranches.reduce((sum, branch) => sum + branch.stock, 0);
      touched = true;
    }
  } else if (update.stock != null && stocksByBranch.length === 0 && update.stock !== stock) {
    stock = update.stock;
    touched = true;
  }

  if (!touched) return line;
  return { ...line, price, stock, active, stocksByBranch };
}

export function applyLiveQuoteUpdates(
  lines: StoredQuoteLine[],
  updates: LiveQuoteUpdate[],
): { lines: StoredQuoteLine[]; changed: boolean } {
  if (lines.length === 0 || updates.length === 0) return { lines, changed: false };
  const byId = new Map(updates.map((update) => [update.idProduct, update]));
  let changed = false;
  const next = lines.map((line) => {
    const update = byId.get(line.idProduct);
    if (!update) return line;
    const patched = patchStoredLiveLine(line, update);
    if (patched !== line) changed = true;
    return patched;
  });
  return { lines: changed ? next : lines, changed };
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

/**
 * Quita del carrito admin los productos de una cotización importada.
 * Usa los idProduct staged al importar (incluye manuales con id regenerado),
 * no solo los productId del JSON de la cotización.
 */
export async function unlinkAdminImportedQuoteCart(
  userId: number,
  rawQuoteNumber: unknown,
  fallbackProductIds: number[] = [],
): Promise<{
  quoteNumber: string;
  lines: StoredQuoteLine[];
  removed: number;
  productIds: number[];
}> {
  const quoteNumber = normalizeQuoteNumber(rawQuoteNumber);
  const cart = await loadCart(userId);
  const staged = cart.importedQuotes.find(
    (quote) => quote.quoteNumber === quoteNumber,
  );
  const sourceIds =
    staged && staged.productIds.length > 0
      ? staged.productIds
      : fallbackProductIds;
  const productIds = [
    ...new Set(
      sourceIds.filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  const ids = new Set(productIds);
  const lines = cart.lines.filter((line) => !ids.has(line.idProduct));
  const removed = cart.lines.length - lines.length;
  // Asegura el carrito en memoria antes de olvidar el import.
  memoryCarts.set(userId, cart);
  forgetAdminQuoteImport(userId, quoteNumber);
  await writeAdminQuoteCart(userId, lines);
  return { quoteNumber, lines, removed, productIds };
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

/** Serializa read→mutate→write del carrito por usuario (evita que 2 adds se pisen). */
const cartWriteLocks = new Map<number, Promise<unknown>>();

export async function withAdminQuoteCartLock<T>(
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = cartWriteLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => gate);
  cartWriteLocks.set(userId, chained);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (cartWriteLocks.get(userId) === chained) {
      cartWriteLocks.delete(userId);
    }
  }
}
