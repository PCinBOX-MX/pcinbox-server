import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { createHash, createHmac } from "crypto";
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

const QUOTE_NUMBER_PATTERN = /^COT-[A-Z0-9-]{8,55}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,100}$/;
const GUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;
const QUOTE_LIMIT = 3;
const QUOTE_WINDOW_MS = 24 * 60 * 60 * 1000;

type CheckoutMode = "cart" | "buy_now";
type CheckoutLine = {
  productId: string;
  quantity: number;
  storeId: number | null;
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
  createdAt: true,
  expiresAt: true,
  userId: true,
  guestScopeHash: true,
  cartHash: true,
  checkoutMode: true,
  users: {
    select: {
      name: true,
      lastname: true,
      email: true,
    },
  },
} satisfies Prisma.cotizacionesSelect;

type QuoteRecord = Prisma.cotizacionesGetPayload<{ select: typeof quoteSelect }>;

const serializeQuote = (quote: QuoteRecord) => {
  const { users, guestScopeHash: _guest, cartHash: _cart, ...safe } = quote;
  return {
    ...safe,
    idCotizacion: Number(quote.idCotizacion),
    userId: quote.userId == null ? null : Number(quote.userId),
    totalAmount: Number(quote.totalAmount),
    customer: users
      ? {
          name: [users.name, users.lastname].filter(Boolean).join(" "),
          email: users.email,
        }
      : null,
  };
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

    const lines: CheckoutLine[] = parsed.lines.map((rawLine) => {
      if (!rawLine || typeof rawLine !== "object") {
        throw new Error("Línea inválida");
      }
      const line = rawLine as Record<string, unknown>;
      const productId = String(line.productId ?? "").trim();
      const quantity = Number(line.quantity);
      const storeId =
        line.storeId === null || line.storeId === undefined
          ? null
          : Number(line.storeId);
      if (
        !productId ||
        productId.length > 64 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1_000 ||
        (storeId !== null &&
          (!Number.isSafeInteger(storeId) || storeId < 0))
      ) {
        throw new Error("Línea inválida");
      }
      return { productId, quantity, storeId };
    });

    if (lines.reduce((total, line) => total + line.quantity, 0) !== itemCount) {
      return null;
    }
    lines.sort((a, b) =>
      `${a.productId}:${a.storeId ?? "null"}:${a.quantity}`.localeCompare(
        `${b.productId}:${b.storeId ?? "null"}:${b.quantity}`,
      ),
    );
    const canonical = JSON.stringify({ mode: parsed.mode, lines });
    return {
      mode: parsed.mode,
      lines,
      cartHash: createHash("sha256").update(canonical).digest("hex"),
    };
  } catch {
    return null;
  }
};

const guestScopeHash = (req: CustomRequestI) => {
  const rawHeader = req.headers["x-quote-guest-id"];
  const guestId = String(
    Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || "",
  ).trim();
  if (!GUEST_ID_PATTERN.test(guestId)) return null;

  const environment = (
    process.env.COTIZACIONES_ENV ||
    process.env.NODE_ENV ||
    ""
  ).toLowerCase();
  const hosted = ["prod", "production", "qa"].includes(environment);
  const secret =
    process.env.COTIZACIONES_GUEST_HASH_SECRET?.trim() ||
    (!hosted ? process.env.KEY_JWT || "pcinbox-local-guest-quotes" : "");
  if (!secret) {
    throw new Error("COTIZACIONES_GUEST_HASH_SECRET no está configurado");
  }
  const ip = String(req.ip || req.socket.remoteAddress || "unknown")
    .replace(/^::ffff:/, "")
    .trim();
  return createHmac("sha256", secret).update(`${guestId}|${ip}`).digest("hex");
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
  userId: number | null,
  guestHash: string | null,
  cartHash: string,
  since: Date,
): Prisma.cotizacionesWhereInput => ({
  cartHash,
  createdAt: { gte: since },
  ...(userId !== null ? { userId } : { userId: null, guestScopeHash: guestHash }),
});

export const quotaResponse = (count: number, oldestCreatedAt: Date) => ({
  limit: QUOTE_LIMIT,
  remaining: Math.max(0, QUOTE_LIMIT - count),
  resetAt: new Date(oldestCreatedAt.getTime() + QUOTE_WINDOW_MS),
});

export const createQuote = async (req: CustomRequestI, res: Response) => {
  const uploadedFile = req.file;
  const temporaryPath = uploadedFile?.path;
  let finalPath: string | null = null;

  try {
    if (!temporaryPath || !uploadedFile) {
      return res.status(400).json({
        ok: false,
        message: "Debes adjuntar la cotización en formato PDF",
      });
    }

    const parsedUserId = Number(req.idUser);
    const userId =
      Number.isSafeInteger(parsedUserId) && parsedUserId > 0
        ? parsedUserId
        : null;
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
        message: "Los metadatos de la cotización son inválidos",
      });
    }

    const guestHash = userId === null ? guestScopeHash(req) : null;
    if (userId === null && !guestHash) {
      return res.status(400).json({
        ok: false,
        message: "No fue posible identificar la sesión invitada",
      });
    }

    const sha256 = await validatePdfAndHash(temporaryPath);
    const existing = await prisma.cotizaciones.findUnique({
      where: { idempotencyKey },
      select: quoteSelect,
    });
    if (existing) {
      const sameOwner =
        userId !== null
          ? Number(existing.userId) === userId
          : existing.userId === null &&
            existing.guestScopeHash === guestHash;
      if (!sameOwner) {
        return res.status(409).json({
          ok: false,
          message: "La clave de idempotencia ya está en uso",
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
            "La clave de idempotencia corresponde a otra cotización",
        });
      }
      return res.status(200).json({
        ok: true,
        message: "La cotización ya estaba guardada",
        data: serializeQuote(existing),
        quota: await (async () => {
          const since = new Date(Date.now() - QUOTE_WINDOW_MS);
          const where = quotaWhere(
            userId,
            guestHash,
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
              guestHash,
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
                guestScopeHash: guestHash,
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
      message: "Cotización guardada correctamente",
      data: serializeQuote(transactionResult.created),
      quota: transactionResult.quota,
    });
  } catch (error: any) {
    if (error instanceof QuoteLimitError) {
      return res.status(429).json({
        ok: false,
        code: "QUOTE_LIMIT_REACHED",
        message:
          "Alcanzaste el límite de 3 cotizaciones para esta configuración.",
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
          message: "La cotización ya fue registrada",
        });
      }
    }
    if (
      error instanceof Error &&
      error.message.includes("firma PDF válida")
    ) {
      return res.status(400).json({
        ok: false,
        message: "El archivo no contiene una firma PDF válida",
      });
    }
    return res.status(500).json({
      ok: false,
      message: "No fue posible guardar la cotización",
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
        message: "El rango de fechas es inválido",
      });
    }
    if (to) to.setUTCHours(23, 59, 59, 999);

    const where: Prisma.cotizacionesWhereInput = {
      ...(search
        ? {
            OR: [
              { quoteNumber: { contains: search } },
              { originalFileName: { contains: search } },
              { users: { email: { contains: search } } },
              { users: { name: { contains: search } } },
              { users: { lastname: { contains: search } } },
            ],
          }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [records, total] = await prisma.$transaction([
      prisma.cotizaciones.findMany({
        where,
        select: quoteSelect,
        orderBy: [{ createdAt: "desc" }, { idCotizacion: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.cotizaciones.count({ where }),
    ]);

    return res.status(200).json({
      ok: true,
      data: records.map(serializeQuote),
      pagination: {
        page,
        limit: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
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
      return res.status(400).json({ ok: false, message: "Cotización inválida" });
    }

    const record = await prisma.cotizaciones.findUnique({
      where: { idCotizacion },
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
        message: "Cotización no encontrada",
      });
    }

    const filePath = resolveQuotePath(record.storageKey);
    const details = await stat(filePath).catch(() => null);
    if (!details?.isFile()) {
      return res.status(404).json({
        ok: false,
        message: "El archivo de la cotización ya no está disponible",
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
      message: "No fue posible obtener la cotización",
    });
  }
};

export const deleteAdminQuote = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const idCotizacion = parsePositiveId(req.params.id);
    if (!idCotizacion) {
      return res.status(400).json({ ok: false, message: "Cotización inválida" });
    }

    const record = await prisma.cotizaciones.findUnique({
      where: { idCotizacion },
      select: { storageKey: true },
    });
    if (!record) {
      return res.status(404).json({
        ok: false,
        message: "Cotización no encontrada",
      });
    }

    await prisma.cotizaciones.delete({ where: { idCotizacion } });
    await removeFileIfPresent(resolveQuotePath(record.storageKey)).catch(
      (error) => console.error("No se pudo eliminar el PDF de cotización", error),
    );

    return res.status(200).json({
      ok: true,
      message: "Cotización eliminada correctamente",
      data: { idCotizacion },
    });
  } catch {
    return res.status(500).json({
      ok: false,
      message: "No fue posible eliminar la cotización",
    });
  }
};
