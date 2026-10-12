import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
import { prisma } from "../../db/prismaClient";
import {
  commitTemporaryQuote,
  removeFileIfPresent,
  resolveQuotePath,
  validatePdfAndHash,
} from "../../services/quoteStorage.service";
import {
  readQuotePdfClientIdentity,
  readQuotePdfClientIdentityLight,
  readQuotePdfLinePrices,
  resolvePosCustomerFromPdf,
} from "../../services/quotePdfClient.service";
import {
  decryptCapturedPhone,
  encryptCapturedPhone,
} from "../../services/quotePhoneCrypto.service";
import {
  buildImportedLinesJson,
  normalizeQuoteNumber,
  readStoredQuoteLinesPayload,
} from "../../services/quoteLines.service";
import { readAdminQuoteCart } from "../../services/adminQuoteCart.service";
import {
  DICOTECH_PROVIDER_ID,
  TECHSMART_PROVIDER_ID,
  formatPcinboxBranchDisplayName,
  isPosSellableBranchName,
  normalizePosBranchKey,
} from "../../constants/pcinbox-branch-display";

const QUOTE_NUMBER_PATTERN = /^(?:\d{13}|COT-[A-Z0-9-]{8,55})$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,100}$/;
const PAGE_SIZE = 25;
const QUOTE_LIMIT = 3;
const QUOTE_WINDOW_MS = 24 * 60 * 60 * 1000;

type CheckoutMode = "cart" | "buy_now";
type CheckoutLine = {
  productId: string;
  quantity: number;
  storeId: number | null;
  /** Opcional en request; no se persiste (precios van en Keywords del PDF). */
  unitPrice: number | null;
};

class QuoteLimitError extends Error {
  constructor(public readonly resetAt: Date) {
    super("QUOTE_LIMIT_REACHED");
  }
}

const quoteSelect = {
  idCotizacion: true,
  quoteNumber: true,
  originalFileName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  totalAmount: true,
  itemCount: true,
  includeAssemblyService: true,
  capturedName: true,
  capturedPhone: true,
  active: true,
  createdAt: true,
  expiresAt: true,
  userId: true,
  cartHash: true,
  checkoutMode: true,
  storageKey: true,
  users: {
    select: {
      name: true,
      lastname: true,
      email: true,
      phone: true,
    },
  },
} satisfies Prisma.cotizacionesSelect;

const CAPTURED_PHONE_RE = /^\+\d{1,3}\s+\d{7,15}$/;

const sanitizeCapturedName = (raw: unknown): string | null => {
  const value = String(raw || "")
    .replace(/[^\p{L}\p{N}\s.'\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return value || null;
};

const sanitizeCapturedPhone = (raw: unknown): string | null => {
  const value = String(raw || "").trim().slice(0, 32);
  if (!value) return null;
  if (CAPTURED_PHONE_RE.test(value)) return value;
  const match = value.match(/^(\+\d{1,3}\s+\d{7,15})/);
  return match?.[1] || null;
};

type QuoteRecord = Prisma.cotizacionesGetPayload<{ select: typeof quoteSelect }>;

const accountCustomer = (users: QuoteRecord["users"]) => {
  if (!users) {
    return { name: null as string | null, email: null as string | null, phone: null as string | null };
  }
  const name = [users.name, users.lastname].filter(Boolean).join(" ").trim();
  return {
    name: name || null,
    email: users.email || null,
    phone: users.phone || null,
  };
};

const serializeQuote = (quote: QuoteRecord) => {
  const {
    users,
    cartHash: _cart,
    active: _active,
    storageKey: _storageKey,
    capturedName: _capturedName,
    capturedPhone: _capturedPhone,
    ...safe
  } = quote;
  if (!users) {
    throw new Error("La cotizaci?n no est? asociada a un usuario");
  }
  const fromAccount = accountCustomer(users);
  return {
    ...safe,
    idCotizacion: Number(quote.idCotizacion),
    userId: Number(quote.userId),
    totalAmount: Number(quote.totalAmount),
    customer: {
      name: fromAccount.name || "",
      email: fromAccount.email || "",
      phone: fromAccount.phone,
    },
  };
};

/**
 * Cliente para admin:
 * 1) Nombre/tel capturados al generar (columnas)
 * 2) PDF Keywords / texto (cotizaciones viejas)
 * 3) Cuenta dueña de la cotización
 */
const serializeQuoteWithPdfCustomer = async (quote: QuoteRecord) => {
  const base = serializeQuote(quote);
  const capturedName = String(quote.capturedName || "").trim();
  const capturedPhone = String(quote.capturedPhone || "").trim();

  if (capturedName || capturedPhone) {
    const phonePlain = capturedPhone
      ? decryptCapturedPhone(capturedPhone)
      : null;
    return {
      ...base,
      customer: {
        name: capturedName,
        email: "",
        phone: phonePlain,
      },
    };
  }

  let pdfClient = await readQuotePdfClientIdentityLight(quote.storageKey);
  // Keywords indirectos / PDFs viejos: leer bloque Cliente del PDF.
  if (!pdfClient) {
    pdfClient = await readQuotePdfClientIdentity(quote.storageKey);
  }
  const fromPdf = resolvePosCustomerFromPdf(pdfClient);
  if (fromPdf.name || fromPdf.email || fromPdf.phone) {
    return {
      ...base,
      customer: {
        name: fromPdf.name || "",
        email: fromPdf.email || "",
        phone: fromPdf.phone,
      },
    };
  }
  return base;
};

export const parseCheckoutContext = (
  raw: unknown,
  itemCount: number,
): { mode: CheckoutMode; lines: CheckoutLine[]; cartHash: string } | null => {
  try {
    const parsed = JSON.parse(String(raw || "")) as {
      mode?: unknown;
      lines?: unknown;
    };
    if (
      (parsed.mode !== "cart" && parsed.mode !== "buy_now") ||
      !Array.isArray(parsed.lines) ||
      parsed.lines.length < 1 ||
      parsed.lines.length > 100
    ) {
      return null;
    }

    const expectedItemCount = Number(itemCount);
    const lines: CheckoutLine[] = parsed.lines.map((rawLine) => {
      if (!rawLine || typeof rawLine !== "object") {
        throw new Error("L?nea inv?lida");
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
            ? Math.round((unitPriceRaw + Number.EPSILON) * 100) / 100
            : NaN;
      if (
        !productId ||
        productId.length > 64 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1_000 ||
        (storeId !== null &&
          (!Number.isSafeInteger(storeId) || storeId < 0)) ||
        (unitPrice !== null && !Number.isFinite(unitPrice))
      ) {
        throw new Error("L?nea inv?lida");
      }
      return { productId, quantity, storeId, unitPrice };
    });

    if (
      !Number.isFinite(expectedItemCount) ||
      lines.reduce((total, line) => total + line.quantity, 0) !==
        Math.round(expectedItemCount)
    ) {
      return null;
    }
    lines.sort((a, b) =>
      `${a.productId}:${a.storeId ?? "null"}:${a.quantity}`.localeCompare(
        `${b.productId}:${b.storeId ?? "null"}:${b.quantity}`,
      ),
    );
    // Hash sin unitPrice: la cuota no debe romper si el catálogo cambió de precio.
    const hashLines = lines.map(({ productId, quantity, storeId }) => ({
      productId,
      quantity,
      storeId,
    }));
    const canonical = JSON.stringify({ mode: parsed.mode, lines: hashLines });
    return {
      mode: parsed.mode,
      lines,
      cartHash: createHash("sha256").update(canonical).digest("hex"),
    };
  } catch {
    return null;
  }
};

const sanitizeFileName = (fileName: string, quoteNumber: string) => {
  const baseName = path.basename(fileName || `${quoteNumber}.pdf`);
  const cleaned = baseName
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .slice(0, 240);
  return cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : `${cleaned || quoteNumber}.pdf`;
};

const parsePositiveId = (raw: string | undefined) => {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const retentionDays = () => {
  const configured = Number(process.env.COTIZACIONES_RETENTION_DAYS || 5);
  return Number.isInteger(configured) && configured >= 1 && configured <= 365
    ? configured
    : 5;
};

const quotaWhere = (
  userId: number,
  cartHash: string,
  since: Date,
): Prisma.cotizacionesWhereInput => ({
  userId,
  cartHash,
  createdAt: { gte: since },
});

export const quotaResponse = (count: number, oldestCreatedAt: Date) => ({
  limit: QUOTE_LIMIT,
  remaining: Math.max(0, QUOTE_LIMIT - count),
  resetAt: new Date(oldestCreatedAt.getTime() + QUOTE_WINDOW_MS),
});

const saveUploadedQuote = async (
  req: CustomRequestI,
  res: Response,
  source: "client" | "admin",
) => {
  const uploadedFile = req.file;
  const temporaryPath = uploadedFile?.path;
  let finalPath: string | null = null;

  try {
    if (!temporaryPath || !uploadedFile) {
      return res.status(400).json({
        ok: false,
        message: "Debes adjuntar la cotizaci?n en formato PDF",
      });
    }

    const parsedUserId = Number(req.idUser);
    if (!Number.isSafeInteger(parsedUserId) || parsedUserId <= 0) {
      return res.status(401).json({
        ok: false,
        message: "Debes iniciar sesi?n para generar una cotizaci?n",
      });
    }
    const userId = parsedUserId;
    const quoteNumber = String(req.body.quoteNumber || "")
      .trim()
      .toUpperCase();
    const rawIdempotencyKey = req.headers["idempotency-key"];
    const idempotencyKey = String(
      Array.isArray(rawIdempotencyKey)
        ? rawIdempotencyKey[0]
        : rawIdempotencyKey || quoteNumber,
    ).trim();
    const totalAmount = Number(req.body.totalAmount);
    const itemCount = Number(req.body.itemCount);
    const includeAssemblyService =
      String(req.body.includeAssemblyService).toLowerCase() === "true";
    const capturedName =
      sanitizeCapturedName(req.body.capturedName) ||
      (source === "admin" ? "Venta público general" : null);
    const capturedPhonePlain = sanitizeCapturedPhone(req.body.capturedPhone);
    let capturedPhone: string | null = null;
    if (capturedPhonePlain) {
      try {
        capturedPhone = encryptCapturedPhone(capturedPhonePlain);
      } catch (error) {
        console.error("No se pudo cifrar el teléfono de la cotización", error);
        return res.status(500).json({
          ok: false,
          message: "No fue posible guardar el teléfono de la cotización",
        });
      }
    }
    const checkout = parseCheckoutContext(req.body.checkoutContext, itemCount);

    if (
      !QUOTE_NUMBER_PATTERN.test(quoteNumber) ||
      !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) ||
      !Number.isFinite(totalAmount) ||
      totalAmount < 0 ||
      totalAmount > 9_999_999_999.99 ||
      !Number.isInteger(itemCount) ||
      itemCount < 1 ||
      itemCount > 1_000 ||
      !checkout
    ) {
      return res.status(400).json({
        ok: false,
        message: "Los metadatos de la cotizaci?n son inv?lidos",
      });
    }

    // Solo identidad/qty/bodega en DB; precios cotizados viven en Keywords del PDF.
    const linesForStorage = checkout.lines.map(
      ({ productId, quantity, storeId }) => ({
        productId,
        quantity,
        storeId,
      }),
    );

    const sha256 = await validatePdfAndHash(temporaryPath);
    const existing = await prisma.cotizaciones.findUnique({
      where: { idempotencyKey },
      select: quoteSelect,
    });
    if (existing) {
      if (existing.active === 0) {
        return res.status(409).json({
          ok: false,
          message: "Esta cotizaci?n ya fue archivada",
        });
      }
      if (Number(existing.userId) !== userId) {
        return res.status(409).json({
          ok: false,
          message: "La clave de idempotencia ya est? en uso",
        });
      }
      const sameRequest =
        existing.quoteNumber === quoteNumber &&
        existing.sha256 === sha256 &&
        existing.cartHash === checkout.cartHash &&
        existing.checkoutMode === checkout.mode &&
        Number(existing.totalAmount) === Number(totalAmount.toFixed(2)) &&
        existing.itemCount === itemCount &&
        existing.includeAssemblyService === includeAssemblyService;
      if (!sameRequest) {
        return res.status(409).json({
          ok: false,
          message:
            "La clave de idempotencia corresponde a otra cotizaci?n",
        });
      }
      return res.status(200).json({
        ok: true,
        message: "La cotizaci?n ya estaba guardada",
        data: serializeQuote(existing),
        quota: await (async () => {
          const since = new Date(Date.now() - QUOTE_WINDOW_MS);
          const where = quotaWhere(
            userId,
            checkout.cartHash,
            since,
          );
          const [count, oldest] = await Promise.all([
            prisma.cotizaciones.count({ where }),
            prisma.cotizaciones.findFirst({
              where,
              select: { createdAt: true },
              orderBy: { createdAt: "asc" },
            }),
          ]);
          return quotaResponse(count, oldest?.createdAt || existing.createdAt);
        })(),
      });
    }

    const stored = await commitTemporaryQuote(temporaryPath);
    finalPath = stored.finalPath;
    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + retentionDays() * 24 * 60 * 60 * 1000,
    );

    let transactionResult:
      | { created: QuoteRecord; quota: ReturnType<typeof quotaResponse> }
      | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        transactionResult = await prisma.$transaction(
          async (tx) => {
            const since = new Date(createdAt.getTime() - QUOTE_WINDOW_MS);
            const where = quotaWhere(
              userId,
              checkout.cartHash,
              since,
            );
            const [count, oldest] = await Promise.all([
              tx.cotizaciones.count({ where }),
              tx.cotizaciones.findFirst({
                where,
                select: { createdAt: true },
                orderBy: { createdAt: "asc" },
              }),
            ]);
            if (count >= QUOTE_LIMIT) {
              throw new QuoteLimitError(
                new Date(
                  (oldest?.createdAt || createdAt).getTime() + QUOTE_WINDOW_MS,
                ),
              );
            }

            const created = await tx.cotizaciones.create({
              data: {
                quoteNumber,
                idempotencyKey,
                userId,
                cartHash: checkout.cartHash,
                checkoutMode: checkout.mode,
                storageKey: stored.storageKey,
                originalFileName: sanitizeFileName(
                  uploadedFile.originalname,
                  quoteNumber,
                ),
                mimeType: "application/pdf",
                sizeBytes: uploadedFile.size,
                sha256,
                totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
                itemCount,
                includeAssemblyService,
                linesJson: linesForStorage as unknown as Prisma.InputJsonValue,
                capturedName,
                capturedPhone,
                createdAt,
                expiresAt,
              },
              select: quoteSelect,
            });
            return {
              created,
              quota: quotaResponse(
                count + 1,
                oldest?.createdAt || createdAt,
              ),
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5_000,
            timeout: 10_000,
          },
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!transactionResult) {
      throw new Error("No fue posible confirmar la cuota de cotizaciones");
    }

    return res.status(201).json({
      ok: true,
      message: "Cotizaci?n guardada correctamente",
      data: serializeQuote(transactionResult.created),
      quota: transactionResult.quota,
    });
  } catch (error: any) {
    if (error instanceof QuoteLimitError) {
      return res.status(429).json({
        ok: false,
        code: "QUOTE_LIMIT_REACHED",
        message:
          "Alcanzaste el l?mite de 3 cotizaciones para esta configuraci?n.",
        quota: {
          limit: QUOTE_LIMIT,
          remaining: 0,
          resetAt: error.resetAt,
        },
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          ok: false,
          message: "La cotizaci?n ya fue registrada",
        });
      }
    }
    if (
      error instanceof Error &&
      error.message.includes("firma PDF")
    ) {
      return res.status(400).json({
        ok: false,
        message: "El archivo no contiene una firma PDF v?lida",
      });
    }
    console.error("[createQuote] Error al guardar cotizaci?n:", error);
    return res.status(500).json({
      ok: false,
      message: "No fue posible guardar la cotizaci?n",
      ...(process.env.NODE_ENV !== "production"
        ? {
            detail:
              error instanceof Error
                ? error.message
                : String(error?.message || error),
            code:
              error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : undefined,
          }
        : {}),
    });
  } finally {
    if (temporaryPath) {
      await removeFileIfPresent(temporaryPath).catch(() => undefined);
    }
    if (res.statusCode >= 400 && finalPath) {
      await removeFileIfPresent(finalPath).catch(() => undefined);
    }
  }
};

export const createQuote = (req: CustomRequestI, res: Response) =>
  saveUploadedQuote(req, res, "client");

export const createAdminQuote = (req: CustomRequestI, res: Response) =>
  saveUploadedQuote(req, res, "admin");

const parseCaracteristicas = (raw: unknown) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

type QuoteStockSource = {
  idProduct: bigint;
  providerId: bigint;
  stock: number | null;
  active: number | null;
};

type QuoteStockSnapshot = {
  active: boolean;
  stock: number;
  stocksByBranch: { branchId: number; label: string; stock: number }[];
};

type QuoteBranchRow = {
  idBranche: bigint;
  name: string | null;
  city: string | null;
  providerId: bigint;
};

const QUOTE_BRANCH_ORDER: Record<number, readonly string[]> = {
  [DICOTECH_PROVIDER_ID]: ["santafe", "leon2"],
  [TECHSMART_PROVIDER_ID]: ["gdl", "cdmx"],
};

export function buildQuoteStocksByBranch(
  providerId: number,
  branches: QuoteBranchRow[],
  stockByBranch: Map<string, number>,
) {
  const restricted = QUOTE_BRANCH_ORDER[providerId];
  return branches
    .filter((branch) => {
      const sameProvider = Number(branch.providerId) === providerId;
      if (restricted) {
        return sameProvider && isPosSellableBranchName(providerId, branch.name);
      }
      return sameProvider || stockByBranch.has(String(branch.idBranche));
    })
    .map((branch) => {
      const name = String(branch.name || "").trim();
      const city = String(branch.city || "").trim();
      return {
        branchId: Number(branch.idBranche),
        rawName: name,
        label:
          formatPcinboxBranchDisplayName(name) ||
          city ||
          `Bodega ${branch.idBranche}`,
        stock: stockByBranch.get(String(branch.idBranche)) ?? 0,
      };
    })
    .sort((a, b) => {
      if (restricted) {
        const rank = (rawName: string) => {
          const key = normalizePosBranchKey(rawName);
          const index = restricted.findIndex(
            (name) => normalizePosBranchKey(name) === key,
          );
          return index === -1 ? restricted.length : index;
        };
        return rank(a.rawName) - rank(b.rawName);
      }
      return b.stock - a.stock || a.label.localeCompare(b.label, "es");
    })
    .map(({ branchId, label, stock }) => ({ branchId, label, stock }));
}

async function loadQuoteStockSnapshots(products: QuoteStockSource[]) {
  const snapshots = new Map<string, QuoteStockSnapshot>();
  if (products.length === 0) return snapshots;

  const productIds = products.map((product) => product.idProduct);
  const providerIds = [...new Set(products.map((product) => product.providerId))];
  const [branchRows, stockRows] = await Promise.all([
    prisma.branches.findMany({
      where: { providerId: { in: providerIds } },
      select: {
        idBranche: true,
        name: true,
        city: true,
        providerId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.product_stock.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, branchId: true, stock: true },
    }),
  ]);

  const extraBranchIds = stockRows
    .map((row) => row.branchId)
    .filter(
      (branchId) => !branchRows.some((branch) => branch.idBranche === branchId),
    );
  const extraBranches = extraBranchIds.length
    ? await prisma.branches.findMany({
        where: { idBranche: { in: extraBranchIds } },
        select: {
          idBranche: true,
          name: true,
          city: true,
          providerId: true,
        },
      })
    : [];
  const branches = [...branchRows, ...extraBranches];
  const stockByProduct = new Map<string, Map<string, number>>();
  for (const row of stockRows) {
    const productKey = String(row.productId);
    const byBranch = stockByProduct.get(productKey) ?? new Map<string, number>();
    byBranch.set(String(row.branchId), Number(row.stock ?? 0));
    stockByProduct.set(productKey, byBranch);
  }

  for (const product of products) {
    const byBranch =
      stockByProduct.get(String(product.idProduct)) ?? new Map<string, number>();
    const stocksByBranch = buildQuoteStocksByBranch(
      Number(product.providerId),
      branches,
      byBranch,
    );
    const branchTotal = stocksByBranch.reduce(
      (sum, branch) => sum + branch.stock,
      0,
    );
    snapshots.set(String(product.idProduct), {
      active: product.active === 1,
      stock: stocksByBranch.length > 0 ? branchTotal : Number(product.stock ?? 0),
      stocksByBranch,
    });
  }

  return snapshots;
}

export const searchAdminQuoteProducts = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q.length < 2) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const numericId = /^\d+$/.test(q) ? Number(q) : null;
    const products = await prisma.products.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { sku: { startsWith: q } },
          { upc: { startsWith: q } },
          { idProductExt: { startsWith: q } },
          ...(numericId && Number.isSafeInteger(numericId) && numericId > 0
            ? [{ idProduct: BigInt(numericId) }]
            : []),
        ],
      },
      select: {
        idProduct: true,
        name: true,
        description: true,
        caracteristicas: true,
        price: true,
        image_url: true,
        upc: true,
        sku: true,
        stock: true,
        active: true,
        providerId: true,
      },
      orderBy: { name: "asc" },
      take: 15,
    });

    const snapshots = await loadQuoteStockSnapshots(products);

    return res.status(200).json({
      ok: true,
      data: products.map((product) => {
        const snapshot = snapshots.get(String(product.idProduct));
        return {
          idProduct: Number(product.idProduct),
          name: product.name,
          description: product.description,
          caracteristicas: parseCaracteristicas(product.caracteristicas),
          price: Number(product.price),
          image_url: product.image_url,
          upc: product.upc,
          sku: product.sku,
          active: snapshot?.active ?? false,
          stock: snapshot?.stock ?? Number(product.stock ?? 0),
          stocksByBranch: snapshot?.stocksByBranch ?? [],
        };
      }),
    });
  } catch (error) {
    console.error("[searchAdminQuoteProducts]", error);
    return res.status(500).json({
      ok: false,
      message: "No fue posible buscar productos",
    });
  }
};

export const getAdminQuoteImport = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const quoteNumber = normalizeQuoteNumber(req.params.quoteNumber);
    if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
      return res.status(400).json({
        ok: false,
        message: "El número de cotización no es válido.",
      });
    }

    const quote = await prisma.cotizaciones.findFirst({
      where: { quoteNumber },
      select: {
        idCotizacion: true,
        quoteNumber: true,
        expiresAt: true,
        active: true,
        linesJson: true,
        storageKey: true,
        includeAssemblyService: true,
        capturedName: true,
        capturedPhone: true,
      },
    });
    if (!quote) {
      return res.status(404).json({
        ok: false,
        message:
          "No se encontró esa cotización. Revisa el número o genera una nueva.",
      });
    }
    if (quote.active !== 1 || quote.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({
        ok: false,
        message: "Esa cotización ya no está disponible. Venció o fue archivada.",
      });
    }

    const payload = readStoredQuoteLinesPayload(quote.linesJson);
    if (!payload?.lines.length) {
      return res.status(400).json({
        ok: false,
        message: "Esa cotización no tiene productos para importar.",
      });
    }
    if (payload.importedAt) {
      const userId = Number(req.idUser);
      const cartIsEmpty =
        Number.isSafeInteger(userId) &&
        userId > 0 &&
        (await readAdminQuoteCart(userId)).length === 0;
      if (!cartIsEmpty) {
        return res.status(409).json({
          ok: false,
          message:
            "Esta cotización ya fue importada. No se puede volver a cargar el mismo número.",
        });
      }
    }

    const storedLines = payload.lines;

    const productIds = [
      ...new Set(
        storedLines
          .map((line) => Number(line.productId))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ].slice(0, 100);
    const products = productIds.length
      ? await prisma.products.findMany({
          where: { idProduct: { in: productIds.map((id) => BigInt(id)) } },
          select: {
            idProduct: true,
            name: true,
            description: true,
            caracteristicas: true,
            price: true,
            image_url: true,
            upc: true,
            sku: true,
            stock: true,
            active: true,
            providerId: true,
          },
        })
      : [];
    const snapshots = await loadQuoteStockSnapshots(products);
    const quotedPrices = await readQuotePdfLinePrices(quote.storageKey);
    const byId = new Map(products.map((product) => [Number(product.idProduct), product]));

    let missing = 0;
    const lines = storedLines.flatMap((line) => {
      const idProduct = Number(line.productId);
      if (!Number.isSafeInteger(idProduct) || idProduct <= 0) return [];
      const quantity = Math.min(999, Math.max(1, Math.round(line.quantity)));
      const quotedPrice = quotedPrices.get(idProduct);
      const product = byId.get(idProduct);
      if (!product) {
        missing += 1;
        return [
          {
            idProduct,
            name: `Producto #${idProduct}`,
            description: null as string | null,
            caracteristicas: null as unknown,
            price: quotedPrice ?? 0,
            image_url: null as unknown,
            upc: null as string | null,
            sku: null as string | null,
            active: false,
            stock: 0,
            stocksByBranch: [] as { branchId: number; label: string; stock: number }[],
            quantity,
          },
        ];
      }
      const snapshot = snapshots.get(String(product.idProduct));
      return [
        {
          idProduct,
          name: product.name,
          description: product.description,
          caracteristicas: parseCaracteristicas(product.caracteristicas),
          price: quotedPrice ?? Number(product.price),
          image_url: product.image_url,
          upc: product.upc,
          sku: product.sku,
          active: snapshot?.active ?? false,
          stock: snapshot?.stock ?? Number(product.stock ?? 0),
          stocksByBranch: snapshot?.stocksByBranch ?? [],
          quantity,
        },
      ];
    });

    if (lines.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Esa cotización no tiene productos para importar.",
      });
    }

    let customerPhone = "";
    if (quote.capturedPhone) {
      try {
        customerPhone = decryptCapturedPhone(quote.capturedPhone) || "";
      } catch {
        customerPhone = "";
      }
    }
    const capturedName = String(quote.capturedName || "").trim();
    const customerName =
      capturedName.toLowerCase() === "venta público general" ? "" : capturedName;

    return res.status(200).json({
      ok: true,
      data: {
        quoteNumber: quote.quoteNumber,
        customerName,
        customerPhone,
        includeAssembly: quote.includeAssemblyService === true,
        missing,
        lines,
      },
    });
  } catch (error) {
    console.error("[getAdminQuoteImport]", error);
    return res.status(500).json({
      ok: false,
      message: "No fue posible importar la cotización.",
    });
  }
};

export const markAdminQuoteImported = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const quoteNumber = normalizeQuoteNumber(req.params.quoteNumber);
    if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
      return res.status(400).json({
        ok: false,
        message: "El número de cotización no es válido.",
      });
    }
    const userId = Number(req.idUser);
    const quote = await prisma.cotizaciones.findFirst({
      where: { quoteNumber },
      select: { idCotizacion: true, linesJson: true },
    });
    if (!quote) {
      return res.status(404).json({
        ok: false,
        message: "No se encontró esa cotización.",
      });
    }
    const payload = readStoredQuoteLinesPayload(quote.linesJson);
    if (!payload?.lines.length) {
      return res.status(400).json({
        ok: false,
        message: "Esa cotización no tiene productos para importar.",
      });
    }
    if (!payload.importedAt) {
      await prisma.cotizaciones.update({
        where: { idCotizacion: quote.idCotizacion },
        data: {
          linesJson: buildImportedLinesJson(
            payload.lines,
            Number.isSafeInteger(userId) && userId > 0 ? userId : 0,
          ),
        },
      });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[markAdminQuoteImported]", error);
    return res.status(500).json({
      ok: false,
      message: "No fue posible registrar la importación de la cotización.",
    });
  }
};

export const getAdminQuoteProductAvailability = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const ids = [
      ...new Set(
        String(req.query.ids || "")
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ].slice(0, 100);

    if (ids.length === 0) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const products = await prisma.products.findMany({
      where: { idProduct: { in: ids.map((id) => BigInt(id)) } },
      select: {
        idProduct: true,
        providerId: true,
        stock: true,
        active: true,
      },
    });
    const snapshots = await loadQuoteStockSnapshots(products);

    return res.status(200).json({
      ok: true,
      data: products.map((product) => {
        const snapshot = snapshots.get(String(product.idProduct));
        return {
          idProduct: Number(product.idProduct),
          active: snapshot?.active ?? product.active === 1,
          stock: snapshot?.stock ?? Number(product.stock ?? 0),
          stocksByBranch: snapshot?.stocksByBranch ?? [],
        };
      }),
    });
  } catch (error) {
    console.error("[getAdminQuoteProductAvailability]", error);
    return res.status(500).json({
      ok: false,
      message: "No fue posible consultar el stock de los productos",
    });
  }
};

export const listAdminQuotes = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const requestedPage = Number(req.query.page);
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const search = String(req.query.search || "").trim().slice(0, 100);
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime()))
    ) {
      return res.status(400).json({
        ok: false,
        message: "El rango de fechas es inv?lido",
      });
    }
    if (to) to.setUTCHours(23, 59, 59, 999);

    // El Cliente de la UI sale del PDF; con búsqueda hay que filtrar tras enriquecer.
    const baseWhere: Prisma.cotizacionesWhereInput = {
      active: 1,
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    if (!search) {
      const [records, total] = await prisma.$transaction([
        prisma.cotizaciones.findMany({
          where: baseWhere,
          select: quoteSelect,
          orderBy: [{ createdAt: "desc" }, { idCotizacion: "desc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
        prisma.cotizaciones.count({ where: baseWhere }),
      ]);

      const data = await Promise.all(
        records.map((record) => serializeQuoteWithPdfCustomer(record)),
      );

      return res.status(200).json({
        ok: true,
        data,
        pagination: {
          page,
          limit: PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        },
      });
    }

    const SEARCH_POOL_LIMIT = 500;
    const pool = await prisma.cotizaciones.findMany({
      where: baseWhere,
      select: quoteSelect,
      orderBy: [{ createdAt: "desc" }, { idCotizacion: "desc" }],
      take: SEARCH_POOL_LIMIT,
    });

    const enriched = await Promise.all(
      pool.map((record) => serializeQuoteWithPdfCustomer(record)),
    );

    const needle = search.toLowerCase();
    const needleDigits = search.replace(/\D/g, "");
    const filtered = enriched.filter((item) => {
      const name = String(item.customer?.name || "").toLowerCase();
      const email = String(item.customer?.email || "").toLowerCase();
      const phone = String(item.customer?.phone || "").toLowerCase();
      const phoneDigits = phone.replace(/\D/g, "");
      const folio = String(item.quoteNumber || "").toLowerCase();
      const file = String(item.originalFileName || "").toLowerCase();

      if (
        folio.includes(needle) ||
        file.includes(needle) ||
        name.includes(needle) ||
        email.includes(needle) ||
        phone.includes(needle)
      ) {
        return true;
      }
      if (needleDigits.length >= 4 && phoneDigits.includes(needleDigits)) {
        return true;
      }
      return false;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const data = filtered.slice(start, start + PAGE_SIZE);

    return res.status(200).json({
      ok: true,
      data,
      pagination: {
        page: safePage,
        limit: PAGE_SIZE,
        total,
        totalPages,
      },
    });
  } catch {
    return res.status(500).json({
      ok: false,
      message: "No fue posible consultar las cotizaciones",
    });
  }
};

export const streamAdminQuote = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const idCotizacion = parsePositiveId(req.params.id);
    if (!idCotizacion) {
      return res.status(400).json({ ok: false, message: "Cotizaci?n inv?lida" });
    }

    const record = await prisma.cotizaciones.findFirst({
      where: { idCotizacion, active: 1 },
      select: {
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        sha256: true,
      },
    });
    if (!record) {
      return res.status(404).json({
        ok: false,
        message: "Cotizaci?n no encontrada o ya archivada",
      });
    }

    const filePath = resolveQuotePath(record.storageKey);
    const details = await stat(filePath).catch(() => null);
    if (!details?.isFile()) {
      return res.status(404).json({
        ok: false,
        message: "El archivo de la cotizaci?n ya no est? disponible",
      });
    }

    const disposition =
      String(req.query.disposition).toLowerCase() === "attachment"
        ? "attachment"
        : "inline";
    const fileName = sanitizeFileName(record.originalFileName, "cotizacion");
    res.setHeader("Content-Type", record.mimeType);
    res.setHeader("Content-Length", details.size);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("ETag", `"${record.sha256}"`);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) res.sendStatus(500);
      else res.destroy();
    });
    stream.pipe(res);
  } catch {
    return res.status(500).json({
      ok: false,
      message: "No fue posible obtener la cotizaci?n",
    });
  }
};

export const archiveAdminQuote = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const idCotizacion = parsePositiveId(req.params.id);
    if (!idCotizacion) {
      return res.status(400).json({ ok: false, message: "Cotizaci?n inv?lida" });
    }

    const record = await prisma.cotizaciones.findFirst({
      where: { idCotizacion, active: 1 },
      select: { storageKey: true },
    });
    if (!record) {
      return res.status(404).json({
        ok: false,
        message: "Cotizaci?n no encontrada o ya archivada",
      });
    }

    const archived = await prisma.cotizaciones.updateMany({
      where: { idCotizacion, active: 1 },
      data: { active: 0 },
    });
    if (archived.count === 0) {
      return res.status(404).json({
        ok: false,
        message: "Cotizaci?n no encontrada o ya archivada",
      });
    }

    try {
      await removeFileIfPresent(resolveQuotePath(record.storageKey));
    } catch (fileError) {
      await prisma.cotizaciones
        .updateMany({
          where: { idCotizacion, active: 0 },
          data: { active: 1 },
        })
        .catch((rollbackError) => {
          console.error(
            "No se pudo restaurar la cotizaci?n tras fallar el borrado del PDF",
            rollbackError,
          );
        });
      throw fileError;
    }

    return res.status(200).json({
      ok: true,
      message: "Cotizaci?n archivada y PDF eliminado correctamente",
      data: { idCotizacion },
    });
  } catch (error) {
    console.error("No se pudo archivar la cotizaci?n y eliminar su PDF", error);
    return res.status(500).json({
      ok: false,
      message: "No fue posible archivar la cotizaci?n y eliminar su PDF",
    });
  }
};
