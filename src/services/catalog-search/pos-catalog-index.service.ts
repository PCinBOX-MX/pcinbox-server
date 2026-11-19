import { prisma } from "../../db/prismaClient";
import {
  buildInvertedIndex,
  type InvertedIndex,
} from "./inverted-index.service";

/** Fila ligera para encontrar productos. El detalle se lee después, solo de los ids. */
export type PosCatalogRow = {
  idProduct: number;
  name: string | null;
  description: string | null;
  sku: string | null;
  upc: string | null;
  idProductExt: string | null;
  nameMarca: string | null;
  nameCategory: string | null;
  isPC: number;
  active: number;
};

const TTL_MS = 120_000;

let cached: { at: number; index: InvertedIndex<PosCatalogRow> } | null = null;
let pending: Promise<InvertedIndex<PosCatalogRow>> | null = null;

export function invalidatePosCatalogIndex(): void {
  cached = null;
}

async function loadPosCatalogIndex(): Promise<InvertedIndex<PosCatalogRow>> {
  const products = await prisma.products.findMany({
    where: { active: 1 },
    select: {
      idProduct: true,
      name: true,
      description: true,
      sku: true,
      upc: true,
      idProductExt: true,
      isPC: true,
      active: true,
      marca: { select: { name: true } },
      categories: { select: { name: true } },
    },
  });

  const rows: PosCatalogRow[] = products.map((product) => ({
    idProduct: Number(product.idProduct),
    name: product.name,
    description: product.description
      ? String(product.description).slice(0, 400)
      : null,
    sku: product.sku,
    upc: product.upc,
    idProductExt: product.idProductExt,
    nameMarca: product.marca?.name ?? null,
    nameCategory: product.categories?.name ?? null,
    isPC: Number(product.isPC) === 1 ? 1 : 0,
    active: Number(product.active) === 1 ? 1 : 0,
  }));

  const index = buildInvertedIndex(rows);
  cached = { at: Date.now(), index };
  return index;
}

/** Una sola copia por proceso. POS y cotizaciones la comparten. */
export async function getPosCatalogIndex(): Promise<InvertedIndex<PosCatalogRow>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.index;
  if (!pending) {
    pending = loadPosCatalogIndex().finally(() => {
      pending = null;
    });
  }
  return pending;
}
