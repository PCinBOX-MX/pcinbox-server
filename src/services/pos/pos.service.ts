import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
import {
  formatPcinboxBranchDisplayName,
  isPosSellableBranchName,
} from "../../constants/pcinbox-branch-display";
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

  return String(next);
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

type ProviderBranchRow = {
  idBranche: bigint | number;
  name: string | null;
  city: string | null;
  providerId: bigint | number;
  providers: { companyName: string | null } | null;
};

/** Bodegas POS por proveedor (mismas reglas que pcinbox-client). */
function buildPosStocksByBranch(params: {
  providerId: number;
  providerName: string | null;
  providerBranchList: ProviderBranchRow[];
  stockMap: Map<number, number>;
}): PosBranchStock[] {
  const { providerId, providerName, providerBranchList, stockMap } = params;

  const stocksByBranch: PosBranchStock[] = providerBranchList
    .filter((b) => isPosSellableBranchName(providerId, b.name))
    .map((b) => {
      const id = Number(b.idBranche);
      const display =
        formatPcinboxBranchDisplayName(b.name) ||
        [b.name, b.city].filter(Boolean).join(" — ") ||
        `Bodega ${id}`;
      return {
        branchId: id,
        name: b.name,
        city: b.city,
        providerId: Number(b.providerId),
        providerName,
        stock: stockMap.get(id) ?? 0,
        // Label limpio (como client): sin concatenar proveedor.
        label: display,
      };
    });

  // Provider 1 sin fila de bodega: stock global (sin selector de bodegas).
  if (providerId === 1 && stocksByBranch.length === 0) {
    return [];
  }

  stocksByBranch.sort(
    (a, b) => b.stock - a.stock || a.label.localeCompare(b.label),
  );
  return stocksByBranch;
}

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
  specs?: string | null,
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
  const specText = normalizeMatchText(specs);

  if (sku === q || upc === q || idExt === q) score += 200;
  if (name === q) score += 150;
  if (name.startsWith(q)) score += 80;
  if (sku.includes(q) || upc.includes(q) || idExt.includes(q)) score += 70;
  if (marcaName.includes(q)) score += 40;
  if (categoryName.includes(q)) score += 35;
  if (description.includes(q)) score += 15;
  if (specText.includes(q)) score += 18;

  for (const rawToken of tokens) {
    const token = normalizeMatchText(rawToken);
    if (token.length < 1) continue;
    if (name.includes(token)) score += 30;
    if (marcaName.includes(token)) score += 20;
    if (categoryName.includes(token)) score += 18;
    if (sku.includes(token) || upc.includes(token) || idExt.includes(token))
      score += 35;
    if (description.includes(token)) score += 8;
    if (specText.includes(token)) score += 12;
  }

  return score;
}

const PC_TIPO_LABELS: Record<string, string> = {
  workstation: "Workstation",
  pro: "PC Gamer Pro",
  intermedia: "PC Gamer Intermedia",
  entrada: "PC Gamer de entrada",
};

function specsBlob(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return "";
  }
}

function pcTipoValue(raw: unknown): string | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const row = parsed.find(
    (item) => String(item?.prop ?? "").trim().toLowerCase() === "tipo",
  );
  const value = String(row?.value ?? "").trim();
  return value || null;
}

function pcTipoLabel(raw: unknown): string | null {
  const tipo = pcTipoValue(raw);
  if (!tipo) return null;
  return PC_TIPO_LABELS[tipo.toLowerCase()] || null;
}

/** Tipos de PC armada que el cajero está buscando (gamer / workstation). */
function assembledPcTipos(rawQuery: string): string[] {
  const n = normalizeMatchText(rawQuery);
  const tipos = new Set<string>();
  if (/workstation|work station|estacion de trabajo/.test(n)) {
    tipos.add("workStation");
  }
  if (/\bgamer\b/.test(n)) {
    tipos.add("pro");
    tipos.add("intermedia");
    tipos.add("entrada");
  }
  return [...tipos];
}

function likeTerm(term: string): string | null {
  const clean = term.replace(/[%_\\]/g, "").trim();
  if (clean.length < 3 && !/^\d{2,}$/.test(clean)) return null;
  return `%${clean}%`;
}

/** PCs armadas que coinciden por nombre, specs o tipo, aparte del tope de componentes. */
async function findAssembledPcIds(params: {
  terms: string[];
  tipos: string[];
}): Promise<number[]> {
  const likes = [
    ...new Set(
      params.terms.map(likeTerm).filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 4);
  const tipoLikes = params.tipos.flatMap((tipo) => {
    const value = tipo.toLowerCase();
    return [
      `%"value":"${value}",%`,
      `%"value":"${value}"}%`,
      `%"value": "${value}",%`,
      `%"value": "${value}"}%`,
    ];
  });
  if (likes.length === 0 && tipoLikes.length === 0) return [];

  const clauses = [
    ...likes.map(
      (like) => Prisma.sql`(
        LOWER(name) LIKE LOWER(${like})
        OR LOWER(IFNULL(sku, '')) LIKE LOWER(${like})
        OR LOWER(IFNULL(upc, '')) LIKE LOWER(${like})
        OR LOWER(IFNULL(description, '')) LIKE LOWER(${like})
        OR LOWER(CAST(IFNULL(caracteristicas, '') AS CHAR)) LIKE LOWER(${like})
      )`,
    ),
    ...tipoLikes.map(
      (like) =>
        Prisma.sql`LOWER(CAST(IFNULL(caracteristicas, '') AS CHAR)) LIKE LOWER(${like})`,
    ),
  ];

  const rows = await prisma.$queryRaw<Array<{ idProduct: bigint | number }>>`
    SELECT idProduct
    FROM products
    WHERE active = 1 AND isPC = 1 AND (${Prisma.join(clauses, " OR ")})
    LIMIT 24
  `;
  return rows
    .map((row) => Number(row.idProduct))
    .filter((id) => Number.isFinite(id) && id > 0);
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
  ].slice(0, 6);

  const or: Prisma.productsWhereInput[] = [];

  // Siempre permitir buscar por idProductExt (clave externa / número de parte)
  if (raw.length >= 2) {
    or.push(
      { idProductExt: { equals: raw } },
      { idProductExt: { startsWith: raw } },
    );
  }

  // Código de barras / SKU: exacto + prefijo (aprovecha índices B-tree)
  if (/^\d{6,}$/.test(raw) || /^[A-Za-z0-9\-_.]{4,}$/.test(raw)) {
    or.push(
      { sku: { equals: raw } },
      { upc: { equals: raw } },
      { sku: { startsWith: raw } },
      { upc: { startsWith: raw } },
    );
  }

  for (const term of termBag) {
    // Nombre sigue con contains (texto libre); códigos con prefijo.
    or.push(
      { name: { contains: term } },
      { sku: { startsWith: term } },
      { upc: { startsWith: term } },
      { idProductExt: { startsWith: term } },
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
    isPC: true,
    caracteristicas: true,
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
          warrantyMode: true,
        },
      })
    : await prisma.products.findMany({
        where: { active: 1, OR: or },
        take: takeCandidates,
        select: lightSelect,
      });

  const pcTipos = assembledPcTipos(raw);
  const extraPcIds = (
    await findAssembledPcIds({ terms: termBag, tipos: pcTipos }).catch(
      () => [] as number[],
    )
  ).filter((id) => !products.some((p) => Number(p.idProduct) === id));

  const pcExtra =
    extraPcIds.length === 0
      ? []
      : hasSerialCols
        ? await prisma.products.findMany({
            where: { active: 1, isPC: 1, idProduct: { in: extraPcIds } },
            select: {
              ...lightSelect,
              requiresSerial: true,
              warrantyMonths: true,
              warrantyMode: true,
            },
          })
        : await prisma.products.findMany({
            where: { active: 1, isPC: 1, idProduct: { in: extraPcIds } },
            select: lightSelect,
          });

  const catalog = [...products, ...pcExtra];

  // Scoring: tokens originales + normalizados (para "tarjeta madre" y "motherboard")
  const scoreTokens = [
    ...new Set([...rawTokens, ...tokens].filter((t) => t.length >= 1)),
  ];

  const rankedAll = catalog
    .map((p: any) => {
      const specs = specsBlob(p.caracteristicas);
      const row = {
        name: p.name as string,
        sku: p.sku as string | null,
        upc: p.upc as string | null,
        description: (p.description as string | null) ?? null,
        idProductExt: p.idProductExt as string | null,
        marcaName: (p.marca?.name as string | null) ?? null,
        categoryName: (p.categories?.name as string | null) ?? null,
      };
      const scoreRaw = scorePosProduct(
        row,
        normalizeMatchText(raw),
        rawTokens,
        specs,
      );
      const scoreNorm = scorePosProduct(
        row,
        normalizedQuery,
        scoreTokens,
        specs,
      );
      let score = Math.max(scoreRaw, scoreNorm);
      const tipo = pcTipoValue(p.caracteristicas);
      if (
        Number(p.isPC) === 1 &&
        tipo &&
        pcTipos.some((item) => item.toLowerCase() === tipo.toLowerCase())
      ) {
        score += 120;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.p.name || "").localeCompare(String(b.p.name || "")),
    );

  const resultCap = Math.min(Math.max(limit, 1), 40);
  const top = rankedAll.slice(0, resultCap);
  const topIds = new Set(top.map((r) => Number(r.p.idProduct)));
  const extraPcs = rankedAll
    .filter(
      (r) =>
        Number(r.p.isPC) === 1 &&
        !topIds.has(Number(r.p.idProduct)),
    )
    .slice(0, 5);
  const ranked =
    extraPcs.length === 0
      ? top
      : [...top.slice(0, resultCap - extraPcs.length), ...extraPcs].sort(
          (a, b) =>
            b.score - a.score ||
            String(a.p.name || "").localeCompare(String(b.p.name || "")),
        );

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
    const stocksByBranch = buildPosStocksByBranch({
      providerId,
      providerName,
      providerBranchList,
      stockMap,
    });
    const preferred =
      stocksByBranch.find((s) => s.stock > 0) || stocksByBranch[0] || null;
    // Existencia real desde DB para los 3 proveedores.
    const inStock =
      stocksByBranch.length > 0
        ? stocksByBranch.some((s) => s.stock > 0)
        : Number(p.stock) > 0;

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
      warrantyMonths: (p as any).warrantyMonths != null && Number((p as any).warrantyMonths) > 0
        ? Number((p as any).warrantyMonths)
        : null,
      warrantyMode: (p as any).warrantyMode
        ? String((p as any).warrantyMode)
        : null,
      isPC: Number((p as any).isPC) === 1,
      pcLabel:
        Number((p as any).isPC) === 1
          ? pcTipoLabel((p as any).caracteristicas) || "PC armada"
          : null,
      providerId,
      providerName,
      stocksByBranch,
      suggestedBranchId:
        preferred && preferred.stock > 0
          ? preferred.branchId
          : preferred?.branchId ?? null,
      inStock,
      score,
    };
  });
}

export function invalidatePosSearchCatalog() {
  // no-op: ya no hay caché full-catalog
}

/** Hidrata productos por id con el mismo shape que search (stock por bodega). */
export async function hydratePosProductsByIds(
  productIds: number[],
  options?: { includeInactive?: boolean },
) {
  const ids = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  if (ids.length === 0) return [];

  const hasSerialCols = await productsHaveSerialColumns();
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
    isPC: true,
    marca: { select: { name: true } },
    categories: { select: { name: true } },
    providers: { select: { companyName: true } },
  } as const;

  const productWhere = options?.includeInactive
    ? { idProduct: { in: ids } }
    : { active: 1, idProduct: { in: ids } };
  const products = hasSerialCols
    ? await prisma.products.findMany({
        where: productWhere,
        select: {
          ...lightSelect,
          requiresSerial: true,
          warrantyMonths: true,
          warrantyMode: true,
        },
      })
    : await prisma.products.findMany({
        where: productWhere,
        select: lightSelect,
      });

  if (products.length === 0) return [];

  const foundIds = products.map((p) => Number(p.idProduct));
  const providerIds = [
    ...new Set(
      products.map((p) => Number(p.providerId)).filter((id) => id > 0),
    ),
  ];

  const [stockRows, providerBranches] = await Promise.all([
    prisma.product_stock.findMany({
      where: { productId: { in: foundIds } },
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

  return products.map((p: any) => {
    const providerId = Number(p.providerId);
    const providerName = p.providers?.companyName?.trim() || null;
    const stockMap = stockByProduct.get(Number(p.idProduct)) || new Map();

    const providerBranchList = branchesByProvider.get(providerId) || [];
    const stocksByBranch = buildPosStocksByBranch({
      providerId,
      providerName,
      providerBranchList,
      stockMap,
    });
    const preferred =
      stocksByBranch.find((s) => s.stock > 0) || stocksByBranch[0] || null;
    // Existencia real desde DB (product_stock / products.stock) para los 3 proveedores.
    const inStock =
      stocksByBranch.length > 0
        ? stocksByBranch.some((s) => s.stock > 0)
        : Number(p.stock) > 0;

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
      warrantyMonths:
        (p as any).warrantyMonths != null &&
        Number((p as any).warrantyMonths) > 0
          ? Number((p as any).warrantyMonths)
          : null,
      warrantyMode: (p as any).warrantyMode
        ? String((p as any).warrantyMode)
        : null,
      isPC: Number((p as any).isPC) === 1,
      providerId,
      providerName,
      stocksByBranch,
      suggestedBranchId:
        preferred && preferred.stock > 0
          ? preferred.branchId
          : preferred?.branchId ?? null,
      inStock,
      score: 100,
    };
  });
}

export { SELLER_MAX_DISCOUNT_PCT, getProductSerialFlags };
