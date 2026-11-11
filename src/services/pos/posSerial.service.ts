import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function serializeSerial(row: any) {
  return {
    idProductSerial: Number(row.idProductSerial),
    productId: Number(row.productId),
    productName: row.products?.name || null,
    productSku: row.products?.sku || null,
    serialNumber: row.serialNumber,
    branchId: row.branchId != null ? Number(row.branchId) : null,
    branchName: row.branches?.name || null,
    status: row.status,
    posSaleId: row.posSaleId != null ? Number(row.posSaleId) : null,
    posSaleItemId: row.posSaleItemId != null ? Number(row.posSaleItemId) : null,
    folio: row.pos_sales?.folio || null,
    customerUserId:
      row.customerUserId != null ? Number(row.customerUserId) : null,
    customerName: row.customerName || null,
    soldAt: row.soldAt,
    warrantyMonths: row.warrantyMonths,
    warrantyMode: row.warrantyMode ?? null,
    warrantyExpiresAt: row.warrantyExpiresAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const serialInclude = {
  products: { select: { name: true, sku: true } },
  branches: { select: { name: true, city: true } },
  pos_sales: { select: { folio: true, status: true, createdAt: true } },
};

/** Misma clave para comparar una serie contra un UPC (espacios y guiones no cuentan). */
export function serialKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function serialMatchesProductCode(
  serial: string | null | undefined,
  code: string | null | undefined,
): boolean {
  const left = serialKey(serial);
  const right = serialKey(code);
  return Boolean(left) && left === right;
}

export function isSharedBarcodeSerial(
  serial: string,
  codes: Array<string | null | undefined>,
): boolean {
  return codes.some((code) => serialMatchesProductCode(serial, code));
}

/** La serie es el UPC de esta línea o el UPC de algún producto del catálogo. */
export function serialIsSharedBarcode(
  serial: string,
  productUpc: string | null | undefined,
  catalogKeys: Set<string>,
): boolean {
  return (
    isSharedBarcodeSerial(serial, [productUpc]) ||
    catalogKeys.has(serialKey(serial))
  );
}

export async function loadSharedBarcodeKeys(
  tx: Prisma.TransactionClient,
  serials: string[],
): Promise<Set<string>> {
  const list = [
    ...new Set(serials.map((serial) => String(serial || "").trim()).filter(Boolean)),
  ];
  if (list.length === 0) return new Set();
  const rows = await tx.products.findMany({
    where: { upc: { in: list } },
    select: { upc: true },
  });
  const keys = new Set<string>();
  for (const serial of list) {
    if (rows.some((row) => serialMatchesProductCode(serial, row.upc))) {
      keys.add(serialKey(serial));
    }
  }
  return keys;
}

export type SharedSerialGroup = {
  productId: number;
  productName: string;
  serials: string[];
  warrantyMonths: number | null;
  warrantyMode: string | null;
};

export function readSharedSerialGroups(
  events: Array<{ eventType?: string; payload?: unknown }> | null | undefined,
): SharedSerialGroup[] {
  const created = (events || []).find((event) => event.eventType === "created");
  const payload = created?.payload as { sharedSerials?: unknown } | null;
  if (!payload || !Array.isArray(payload.sharedSerials)) return [];
  const groups: SharedSerialGroup[] = [];
  for (const raw of payload.sharedSerials) {
    if (!raw || typeof raw !== "object") continue;
    const group = raw as Partial<SharedSerialGroup>;
    const serials = Array.isArray(group.serials)
      ? group.serials.map((serial) => String(serial || "").trim()).filter(Boolean)
      : [];
    if (!Number.isFinite(Number(group.productId))) continue;
    groups.push({
      productId: Number(group.productId),
      productName: String(group.productName || ""),
      serials,
      warrantyMonths:
        group.warrantyMonths != null && Number.isFinite(Number(group.warrantyMonths))
          ? Number(group.warrantyMonths)
          : null,
      warrantyMode:
        typeof group.warrantyMode === "string" ? group.warrantyMode : null,
    });
  }
  return groups;
}

/** Agrega al ticket y a la garantía las series que son UPC y no viven en product_serials. */
export function mergeSharedBarcodeSerials<
  T extends {
    productId: number | bigint;
    productName?: string | null;
    serials?: Array<Record<string, unknown>>;
  },
>(items: T[], groups: SharedSerialGroup[]): T[] {
  if (!groups.length) return items;
  const queues = new Map<string, SharedSerialGroup[]>();
  for (const group of groups) {
    const key = `${group.productId}|${group.productName}`;
    const queue = queues.get(key) || [];
    queue.push(group);
    queues.set(key, queue);
  }
  let syntheticId = -1;
  return items.map((item) => {
    const key = `${Number(item.productId)}|${item.productName || ""}`;
    const group = queues.get(key)?.shift();
    if (!group) return item;
    const extra = group.serials.map((serialNumber) => ({
      idProductSerial: syntheticId--,
      serialNumber,
      status: "sold",
      warrantyMonths: group.warrantyMonths,
      warrantyMode: group.warrantyMode,
      warrantyExpiresAt: null,
    }));
    return { ...item, serials: [...(item.serials || []), ...extra] };
  });
}

/** Valida y normaliza series por línea de venta. */
export function normalizeItemSerials(
  quantity: number,
  requiresSerial: boolean,
  rawSerials: unknown,
  productLabel: string,
  _productCodes: Array<string | null | undefined> = [],
): string[] {
  const list = Array.isArray(rawSerials)
    ? rawSerials.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  if (requiresSerial) {
    if (list.length !== quantity) {
      throw new Error(
        `${productLabel}: faltan series. Captura ${quantity} número(s), uno por cada pieza, y vuelve a cobrar. Si el campo no aparece, quita el folio, impórtalo de nuevo y, si sigue igual, reporta a soporte el folio y el nombre del producto.`,
      );
    }
  }

  if (list.length > 0 && list.length !== quantity) {
    throw new Error(
      `${productLabel}: hay ${list.length} serie(s) para ${quantity} pieza(s). Captura una serie por pieza, o déjalas todas vacías si el producto no exige serie.`,
    );
  }

  // Repetir la serie en el mismo producto es válido. Otro producto se valida aparte.
  return list;
}

export type PosSerialLineRef = {
  productId: number;
  productName: string;
  productUpc?: string | null;
  isManual?: boolean;
  serials: string[];
};

/** Identidad de la línea: el catálogo por id; la captura manual por nombre. */
export function serialOwnerKey(line: {
  productId: number;
  productName: string;
  isManual?: boolean;
}): string {
  if (line.isManual) {
    return `manual:${String(line.productName || "").trim().toUpperCase()}`;
  }
  return `product:${line.productId}`;
}

/** Serie capturada en dos productos distintos de la misma venta. Null si no hay conflicto. */
export function findCrossProductSerial(
  lines: Array<
    Pick<PosSerialLineRef, "productId" | "productName" | "isManual" | "serials">
  >,
): string | null {
  const ownersByKey = new Map<string, { owners: Set<string>; sample: string }>();
  for (const line of lines) {
    const owner = serialOwnerKey(line);
    const seenOnLine = new Set<string>();
    for (const serial of line.serials) {
      const key = serialKey(serial);
      if (!key || seenOnLine.has(key)) continue;
      seenOnLine.add(key);
      const entry = ownersByKey.get(key) || {
        owners: new Set<string>(),
        sample: serial,
      };
      entry.owners.add(owner);
      ownersByKey.set(key, entry);
    }
  }
  for (const entry of ownersByKey.values()) {
    if (entry.owners.size > 1) return entry.sample;
  }
  return null;
}

/**
 * La primera copia de una serie real va a inventario.
 * Las copias extra y los UPC se guardan en la venta para ticket y garantía.
 */
export function splitRepeatedSerials<T extends PosSerialLineRef>(
  lines: T[],
  catalogKeys: Set<string>,
): Array<T & { trackableSerials: string[]; sharedSerials: string[] }> {
  const counts = new Map<string, Map<string, number>>();
  for (const line of lines) {
    const owner = serialOwnerKey(line);
    const map = counts.get(owner) || new Map<string, number>();
    for (const serial of line.serials) {
      const key = serialKey(serial);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    counts.set(owner, map);
  }

  const taken = new Map<string, Set<string>>();
  return lines.map((line) => {
    const owner = serialOwnerKey(line);
    const map = counts.get(owner) || new Map<string, number>();
    const seen = taken.get(owner) || new Set<string>();
    taken.set(owner, seen);
    const trackableSerials: string[] = [];
    const sharedSerials: string[] = [];
    for (const serial of line.serials) {
      const key = serialKey(serial);
      if (!key) continue;
      if (serialIsSharedBarcode(serial, line.productUpc, catalogKeys)) {
        sharedSerials.push(serial);
        continue;
      }
      if ((map.get(key) || 0) > 1 && seen.has(key)) {
        sharedSerials.push(serial);
        continue;
      }
      trackableSerials.push(serial);
      seen.add(key);
    }
    return { ...line, trackableSerials, sharedSerials };
  });
}

/**
 * Una serie ya vendida o en RMA del mismo producto no vuelve a insertarse.
 * Se anota en la venta. Si pertenece a otro producto, el cobro se detiene.
 */
export function parkAlreadySoldSerials<
  T extends {
    productId: number;
    trackableSerials: string[];
    sharedSerials: string[];
  },
>(
  lines: T[],
  existing: Array<{
    serialNumber: string;
    productId: number | bigint;
    status: string;
  }>,
): string | null {
  const byKey = new Map<string, typeof existing>();
  for (const row of existing) {
    const key = serialKey(row.serialNumber);
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }
  for (const line of lines) {
    const next: string[] = [];
    for (const serial of line.trackableSerials) {
      const matches = byKey.get(serialKey(serial)) || [];
      const other = matches.find(
        (row) => Number(row.productId) !== Number(line.productId),
      );
      if (other) return serial;
      const used = matches.find(
        (row) => row.status === "sold" || row.status === "rma",
      );
      if (used) {
        line.sharedSerials.push(serial);
        continue;
      }
      next.push(serial);
    }
    line.trackableSerials = next;
  }
  return null;
}

export async function assertSerialsAvailable(
  tx: Prisma.TransactionClient,
  serials: string[],
  productCodes: Array<string | null | undefined> = [],
) {
  if (serials.length === 0) return;
  const catalogKeys = await loadSharedBarcodeKeys(tx, serials);
  const trackable = serials.filter(
    (serial) => !serialIsSharedBarcode(serial, null, catalogKeys) &&
      !isSharedBarcodeSerial(serial, productCodes),
  );
  if (trackable.length === 0) return;
  const existing = await tx.product_serials.findMany({
    where: {
      serialNumber: { in: trackable },
    },
    select: { serialNumber: true, status: true },
  });
  for (const row of existing) {
    if (row.status === "sold" || row.status === "rma") {
      throw new Error(
        `La serie ${row.serialNumber} ya está registrada como ${row.status === "sold" ? "vendida" : "RMA"}. Usa otra serie. Si crees que es un error, reporta a soporte esa serie y el folio de la venta.`,
      );
    }
  }
}

export async function assignSerialsOnSale(
  tx: Prisma.TransactionClient,
  params: {
    productId: number;
    branchId: number;
    posSaleId: bigint | number;
    posSaleItemId: bigint | number;
    serials: string[];
    customerUserId: number | null;
    customerName: string | null;
    warrantyMonths: number | null;
    warrantyMode?: string | null;
    soldAt?: Date;
    /** Folio reimportado: la serie ya puede estar vendida en la venta anterior. */
    allowAlreadySold?: boolean;
    /** UPC de la línea: si la serie es ese código, no se registra como serie única. */
    productUpc?: string | null;
  },
) {
  if (params.serials.length === 0) return;
  const catalogKeys = await loadSharedBarcodeKeys(tx, params.serials);
  const serials = params.serials.filter(
    (serial) =>
      !serialIsSharedBarcode(serial, params.productUpc, catalogKeys),
  );
  if (serials.length === 0) return;
  const soldAt = params.soldAt || new Date();
  const months =
    params.warrantyMonths != null && params.warrantyMonths > 0
      ? params.warrantyMonths
      : null;
  const warrantyMode =
    params.warrantyMode === "none" ||
    params.warrantyMode === "service_center" ||
    params.warrantyMode === "months"
      ? params.warrantyMode
      : months != null
        ? "months"
        : null;
  const warrantyExpiresAt =
    months != null ? addMonths(soldAt, months) : null;

  const seen = new Set<string>();
  for (const serialNumber of serials) {
    const key = serialKey(serialNumber);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const existing = await tx.product_serials.findFirst({
      where: { serialNumber },
    });
    if (existing) {
      if (Number(existing.productId) !== params.productId) {
        throw new Error(
          `La serie ${serialNumber} pertenece a otro producto`,
        );
      }
      const claimable: Array<"available" | "returned" | "sold" | "rma"> =
        params.allowAlreadySold
          ? ["available", "returned", "sold", "rma"]
          : ["available", "returned"];
      const claimed = await tx.product_serials.updateMany({
        where: {
          idProductSerial: existing.idProductSerial,
          status: { in: claimable },
        },
        data: {
          status: "sold",
          branchId: params.branchId,
          posSaleId: params.posSaleId,
          posSaleItemId: params.posSaleItemId,
          customerUserId: params.customerUserId,
          customerName: params.customerName,
          soldAt,
          warrantyMonths: months,
          warrantyMode,
          warrantyExpiresAt,
        },
      });
      if (claimed.count === 0) {
        throw new Error(`La serie ${serialNumber} no está disponible`);
      }
    } else {
      await tx.product_serials.create({
        data: {
          productId: params.productId,
          serialNumber,
          branchId: params.branchId,
          status: "sold",
          posSaleId: params.posSaleId,
          posSaleItemId: params.posSaleItemId,
          customerUserId: params.customerUserId,
          customerName: params.customerName,
          soldAt,
          warrantyMonths: months,
          warrantyMode,
          warrantyExpiresAt,
        },
      });
    }
  }
}

export async function releaseSerialsOnCancel(
  tx: Prisma.TransactionClient,
  posSaleId: bigint | number,
) {
  await tx.product_serials.updateMany({
    where: { posSaleId, status: "sold" },
    data: {
      status: "returned",
      notes: "Devuelto por cancelación de venta POS",
    },
  });
}

export async function searchSerials(q: string, limit = 20) {
  const term = String(q || "").trim();
  if (term.length < 2) return [];

  const or: Prisma.product_serialsWhereInput[] = [];
  // Serial completo → índice unique; parcial → prefijo (mejor que LIKE %x%).
  if (term.length >= 8 && !/\s/.test(term)) {
    or.push({ serialNumber: { equals: term } });
  }
  or.push({ serialNumber: { startsWith: term } });
  if (term.length >= 3) {
    or.push({ customerName: { startsWith: term } });
  }

  const rows = await prisma.product_serials.findMany({
    where: { OR: or },
    include: serialInclude,
    take: Math.min(Math.max(limit, 1), 50),
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serializeSerial);
}

export async function getSerialByNumber(serialNumber: string) {
  const sn = String(serialNumber || "").trim();
  if (!sn) return null;
  const row = await prisma.product_serials.findFirst({
    where: { serialNumber: sn },
    include: serialInclude,
  });
  return row ? serializeSerial(row) : null;
}

export async function markSerialRma(params: {
  serialNumber: string;
  notes?: string | null;
}) {
  const sn = String(params.serialNumber || "").trim();
  const row = await prisma.product_serials.findFirst({
    where: { serialNumber: sn },
  });
  if (!row) throw new Error("Serie no encontrada");
  if (row.status !== "sold" && row.status !== "rma") {
    throw new Error("Solo se puede marcar RMA en series vendidas");
  }
  const updated = await prisma.product_serials.update({
    where: { idProductSerial: row.idProductSerial },
    data: {
      status: "rma",
      notes: params.notes
        ? String(params.notes).slice(0, 500)
        : row.notes,
    },
    include: serialInclude,
  });
  return serializeSerial(updated);
}

export async function registerAvailableSerial(params: {
  productId: number;
  serialNumber: string;
  branchId?: number | null;
  notes?: string | null;
}) {
  const serialNumber = String(params.serialNumber || "").trim();
  if (!serialNumber) throw new Error("Número de serie requerido");
  if (!Number.isSafeInteger(params.productId) || params.productId <= 0) {
    throw new Error(
      "No se pudo registrar la serie porque el producto no tiene un identificador válido. Si la línea viene de un folio, quita el folio e impórtalo de nuevo. Si se repite, reporta a soporte el folio y el nombre del producto.",
    );
  }
  const product = await prisma.products.findFirst({
    where: { idProduct: params.productId, active: 1 },
    select: { idProduct: true },
  });
  if (!product) throw new Error("Producto no encontrado");

  const created = await prisma.product_serials.create({
    data: {
      productId: params.productId,
      serialNumber,
      branchId: params.branchId || null,
      status: "available",
      notes: params.notes ? String(params.notes).slice(0, 500) : null,
    },
    include: serialInclude,
  });
  return serializeSerial(created);
}
