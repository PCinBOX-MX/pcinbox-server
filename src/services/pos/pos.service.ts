import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
import {
  normalizeMatchText,
  normalizeSearchTerm,
} from "../../utils/searchNormalization";
import {
  getProductSerialFlags,
  productsHaveSerialColumns,
} from "./posSerialFlags.service";

const SELLER_MAX_DISCOUNT_PCT = 3;

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineTotal(
  unitPrice: number,
  quantity: number,
  discountPct: number,
): number {
  const base = unitPrice * quantity;
  const discounted = base * (1 - discountPct / 100);
  return roundMoney(discounted);
}

export function assertDiscountAllowed(
  discountPct: number,
  isAdmin: boolean,
): void {
  if (discountPct < 0 || discountPct > 100) {
    throw new Error("El descuento debe estar entre 0 y 100%");
  }
  if (!isAdmin && discountPct > SELLER_MAX_DISCOUNT_PCT) {
    throw new Error(
      `Descuento máximo permitido para vendedor: ${SELLER_MAX_DISCOUNT_PCT}%`,
    );
  }
}

export async function nextPosFolio(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ next_val: bigint | number }>>`
    SELECT next_val FROM pos_folio_seq WHERE id = 1 FOR UPDATE
  `;

  let next = Number(rows[0]?.next_val);
  if (!Number.isSafeInteger(next) || next <= 0) {
    const last = await tx.pos_sales.findFirst({
      orderBy: { idPosSale: "desc" },
      select: { idPosSale: true },
    });
    next = Number(last?.idPosSale ?? 0) + 1;
    await tx.$executeRaw`
      INSERT INTO pos_folio_seq (id, next_val) VALUES (1, ${next + 1})
      ON DUPLICATE KEY UPDATE next_val = ${next + 1}
    `;
  } else {
    await tx.$executeRaw`
      UPDATE pos_folio_seq SET next_val = ${next + 1} WHERE id = 1
    `;
  }

  return `PV-${String(next).padStart(7, "0")}`;
}

export type PosBranchStock = {
  branchId: number;
  name: string | null;
  city: string | null;
  providerId: number;
  providerName: string | null;
  stock: number;
  label: string;
};

/** Variantes simples para LIKE sin acentos (a↔á, e↔é…). */
function accentVariants(token: string): string[] {
  const map: Record<string, string> = {
    a: "[aáàäâ]",
    e: "[eéèëê]",
    i: "[iíìïî]",
    o: "[oóòöô]",
    u: "[uúùüû]",
    n: "[nñ]",
  };
  // Para Prisma `contains` no hay regex; devolvemos token plano + sin acentos
  const plain = normalizeMatchText(token);
  const set = new Set<string>([token, plain].filter((t) => t.length > 0));
  return [...set];
}

function scorePosProduct(
  product: {
    name: string | null;
    sku: string | null;
    upc: string | null;
    description: string | null;
    idProductExt: string | null;
    marcaName: string | null;
    categoryName: string | null;
  },
  query: string,
  tokens: string[],
): number {
  let score = 0;
  const q = normalizeMatchText(query);
  const name = normalizeMatchText(product.name);
  const sku = normalizeMatchText(product.sku);
  const upc = normalizeMatchText(product.upc);
  const description = normalizeMatchText(product.description);
  const marcaName = normalizeMatchText(product.marcaName);
  const categoryName = normalizeMatchText(product.categoryName);
  const idExt = normalizeMatchText(product.idProductExt);

  if (sku === q || upc === q || idExt === q) score += 200;
  if (name === q) score += 150;
  if (name.startsWith(q)) score += 80;
  if (sku.includes(q) || upc.includes(q) || idExt.includes(q)) score += 70;
  if (marcaName.includes(q)) score += 40;
  if (categoryName.includes(q)) score += 35;
  if (description.includes(q)) score += 15;

  for (const rawToken of tokens) {
    const token = normalizeMatchText(rawToken);
    if (token.length < 1) continue;
    if (name.includes(token)) score += 30;
    if (marcaName.includes(token)) score += 20;
    if (categoryName.includes(token)) score += 18;
    if (sku.includes(token) || upc.includes(token)) score += 35;
    if (idExt.includes(token)) score += 10;
    if (description.includes(token)) score += 8;
  }

  return score;
}

/** Frases/sinónimos útiles para SQL (además del término ya normalizado). */
function sqlPhraseHints(raw: string, normalized: string): string[] {
  const hints = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (t.length >= 2) hints.add(t);
  };
  push(raw);
  push(normalized);
  // Si la normalización cambió el texto (ej. "tarjeta madre" → "motherboard"),
  // también buscamos la frase original y variantes frecuentes en catálogo ES.
  if (normalizeMatchText(raw) !== normalizeMatchText(normalized)) {
    push(raw);
  }
  if (normalized === "motherboard" || /tarjeta\s+madre/i.test(raw)) {
    push("tarjeta madre");
    push("motherboard");
    push("placa base");
    push("mobo");
  }
  return [...hints].slice(0, 6);
}

/**
 * Búsqueda POS rápida: WHERE liviano (sin description/joins),
 * stock en una 2ª consulta, score en memoria.
 */
export async function searchPosProducts(q: string, limit = 25) {
  const raw = String(q || "").trim();
  if (!raw) return [];
  if (raw.length < 2 && !/^\d{8,}$/.test(raw)) return [];

  const normalizedQuery = normalizeSearchTerm(raw) || normalizeMatchText(raw);
  const rawTokens = normalizeMatchText(raw)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const tokens = normalizedQuery.split(/\s+/).filter((t) => t.length >= 1);
  const phrases = sqlPhraseHints(raw, normalizedQuery);
  const termBag = [
    ...new Set(
      [...phrases, ...tokens.flatMap(accentVariants), ...rawTokens].filter(
        (t) => t.length >= 2 || /^\d+$/.test(t),
      ),
    ),
  ].slice(0, 10);

  const or: Prisma.productsWhereInput[] = [];

  // Código de barras / SKU corto: match directo primero
  if (/^\d{6,}$/.test(raw) || /^[A-Za-z0-9\-_.]{4,}$/.test(raw)) {
    or.push(
      { sku: { equals: raw } },
      { upc: { equals: raw } },
      { idProductExt: { equals: raw } },
      { sku: { contains: raw } },
      { upc: { contains: raw } },
    );
  }

  for (const term of termBag) {
    or.push(
      { name: { contains: term } },
      { sku: { contains: term } },
      { upc: { contains: term } },
      { idProductExt: { contains: term } },
    );
  }

  // Multi-palabra en español: AND de tokens originales sobre name
  // (evita depender solo de "motherboard" cuando el catálogo dice "Tarjeta Madre").
  if (rawTokens.length >= 2) {
    or.push({
      AND: rawTokens.map((t) => ({ name: { contains: t } })),
    });
  }

  if (or.length === 0) return [];

  const hasSerialCols = await productsHaveSerialColumns();
  const takeCandidates = Math.min(Math.max(limit * 3, 30), 60);

  const lightSelect = {
    idProduct: true,
    idProductExt: true,
    name: true,
    description: true,
    price: true,
    stock: true,
    sku: true,
    upc: true,
    image_url: true,
    providerId: true,
    marca: { select: { name: true } },
    categories: { select: { name: true } },
    providers: { select: { companyName: true } },
  } as const;

  const products = hasSerialCols
    ? await prisma.products.findMany({
        where: { active: 1, OR: or },
        take: takeCandidates,
        select: {
          ...lightSelect,
          requiresSerial: true,
          warrantyMonths: true,
        },
      })
    : await prisma.products.findMany({
        where: { active: 1, OR: or },
        take: takeCandidates,
        select: lightSelect,
      });

  // Scoring: tokens originales + normalizados (para "tarjeta madre" y "motherboard")
  const scoreTokens = [
    ...new Set([...rawTokens, ...tokens].filter((t) => t.length >= 1)),
  ];

  const ranked = products
    .map((p: any) => {
      const row = {
        name: p.name as string,
        sku: p.sku as string | null,
        upc: p.upc as string | null,
        description: (p.description as string | null) ?? null,
        idProductExt: p.idProductExt as string | null,
        marcaName: (p.marca?.name as string | null) ?? null,
        categoryName: (p.categories?.name as string | null) ?? null,
      };
      const scoreRaw = scorePosProduct(row, normalizeMatchText(raw), rawTokens);
      const scoreNorm = scorePosProduct(row, normalizedQuery, scoreTokens);
      return { p, score: Math.max(scoreRaw, scoreNorm) };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.p.name || "").localeCompare(String(b.p.name || "")),
    )
    .slice(0, Math.min(Math.max(limit, 1), 40));

  if (ranked.length === 0) return [];

  const productIds = ranked.map((r) => Number(r.p.idProduct));
  const providerIds = [
    ...new Set(
      ranked.map((r) => Number(r.p.providerId)).filter((id) => id > 0),
    ),
  ];

  const [stockRows, providerBranches] = await Promise.all([
    prisma.product_stock.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        branchId: true,
        stock: true,
      },
    }),
    providerIds.length > 0
      ? prisma.branches.findMany({
          where: { providerId: { in: providerIds } },
          select: {
            idBranche: true,
            name: true,
            city: true,
            providerId: true,
            providers: { select: { companyName: true } },
          },
        })
      : Promise.resolve(
          [] as Array<{
            idBranche: bigint | number;
            name: string | null;
            city: string | null;
            providerId: bigint | number;
            providers: { companyName: string | null } | null;
          }>,
        ),
  ]);

  const stockByProduct = new Map<number, Map<number, number>>();
  for (const row of stockRows) {
    const pid = Number(row.productId);
    const bid = Number(row.branchId);
    let m = stockByProduct.get(pid);
    if (!m) {
      m = new Map();
      stockByProduct.set(pid, m);
    }
    m.set(bid, Number(row.stock ?? 0));
  }

  const branchesByProvider = new Map<number, typeof providerBranches>();
  for (const b of providerBranches) {
    const pid = Number(b.providerId);
    const list = branchesByProvider.get(pid) || [];
    list.push(b);
    branchesByProvider.set(pid, list);
  }

  return ranked.map(({ p, score }) => {
    const providerId = Number(p.providerId);
    const providerName = p.providers?.companyName?.trim() || null;
    const stockMap = stockByProduct.get(Number(p.idProduct)) || new Map();

    const providerBranchList = branchesByProvider.get(providerId) || [];
    const stocksByBranch: PosBranchStock[] = providerBranchList.map((b) => {
      const id = Number(b.idBranche);
      const place = [b.name, b.city].filter(Boolean).join(" — ");
      const pName = b.providers?.companyName?.trim() || providerName;
      return {
        branchId: id,
        name: b.name,
        city: b.city,
        providerId: Number(b.providerId),
        providerName: pName,
        stock: stockMap.get(id) ?? 0,
        label: [place, pName].filter(Boolean).join(" · ") || `Bodega ${id}`,
      };
    });

    // Si no hay branches del proveedor pero sí stock en otras, mostrar esas.
    if (stocksByBranch.length === 0 && stockMap.size > 0) {
      for (const [bid, qty] of stockMap) {
        stocksByBranch.push({
          branchId: bid,
          name: null,
          city: null,
          providerId,
          providerName,
          stock: qty,
          label: `Bodega ${bid}`,
        });
      }
    }

    stocksByBranch.sort(
      (a, b) => b.stock - a.stock || a.label.localeCompare(b.label),
    );
    const preferred =
      stocksByBranch.find((s) => s.stock > 0) || stocksByBranch[0] || null;

    return {
      idProduct: Number(p.idProduct),
      idProductExt: p.idProductExt,
      name: p.name,
      price: Number(p.price),
      stockGlobal: Number(p.stock),
      stockBranch: preferred ? preferred.stock : Number(p.stock),
      sku: p.sku,
      upc: p.upc,
      marca: p.marca?.name || null,
      category: p.categories?.name || null,
      image_url: p.image_url,
      requiresSerial: Boolean((p as any).requiresSerial),
      warrantyMonths: (p as any).warrantyMonths ?? 12,
      providerId,
      providerName,
      stocksByBranch,
      suggestedBranchId:
        preferred && preferred.stock > 0 ? preferred.branchId : null,
      score,
    };
  });
}

export function invalidatePosSearchCatalog() {
  // no-op: ya no hay caché full-catalog
}

export { SELLER_MAX_DISCOUNT_PCT, getProductSerialFlags };
