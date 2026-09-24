"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveAdminQuote = exports.streamAdminQuote = exports.listAdminQuotes = exports.createQuote = exports.quotaResponse = exports.parseCheckoutContext = void 0;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prismaClient_1 = require("../../db/prismaClient");
const quoteStorage_service_1 = require("../../services/quoteStorage.service");
const QUOTE_NUMBER_PATTERN = /^(?:\d{13}|COT-[A-Z0-9-]{8,55})$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,100}$/;
const PAGE_SIZE = 25;
const QUOTE_LIMIT = 3;
const QUOTE_WINDOW_MS = 24 * 60 * 60 * 1000;
class QuoteLimitError extends Error {
    resetAt;
    constructor(resetAt) {
        super("QUOTE_LIMIT_REACHED");
        this.resetAt = resetAt;
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
    active: true,
    createdAt: true,
    expiresAt: true,
    userId: true,
    cartHash: true,
    checkoutMode: true,
    users: {
        select: {
            name: true,
            lastname: true,
            email: true,
        },
    },
};
const serializeQuote = (quote) => {
    const { users, cartHash: _cart, active: _active, ...safe } = quote;
    if (!users) {
        throw new Error("La cotizaci?n no est? asociada a un usuario");
    }
    return {
        ...safe,
        idCotizacion: Number(quote.idCotizacion),
        userId: Number(quote.userId),
        totalAmount: Number(quote.totalAmount),
        customer: {
            name: [users.name, users.lastname].filter(Boolean).join(" "),
            email: users.email,
        },
    };
};
const parseCheckoutContext = (raw, itemCount) => {
    try {
        const parsed = JSON.parse(String(raw || ""));
        if ((parsed.mode !== "cart" && parsed.mode !== "buy_now") ||
            !Array.isArray(parsed.lines) ||
            parsed.lines.length < 1 ||
            parsed.lines.length > 100) {
            return null;
        }
        const expectedItemCount = Number(itemCount);
        const lines = parsed.lines.map((rawLine) => {
            if (!rawLine || typeof rawLine !== "object") {
                throw new Error("L?nea inv?lida");
            }
            const line = rawLine;
            const productId = String(line.productId ?? "").trim();
            const quantityRaw = Number(line.quantity);
            const quantity = Number.isFinite(quantityRaw)
                ? Math.round(quantityRaw)
                : NaN;
            const storeId = line.storeId === null ||
                line.storeId === undefined ||
                line.storeId === ""
                ? null
                : Number(line.storeId);
            if (!productId ||
                productId.length > 64 ||
                !Number.isInteger(quantity) ||
                quantity < 1 ||
                quantity > 1_000 ||
                (storeId !== null &&
                    (!Number.isSafeInteger(storeId) || storeId < 0))) {
                throw new Error("L?nea inv?lida");
            }
            return { productId, quantity, storeId };
        });
        if (!Number.isFinite(expectedItemCount) ||
            lines.reduce((total, line) => total + line.quantity, 0) !==
                Math.round(expectedItemCount)) {
            return null;
        }
        lines.sort((a, b) => `${a.productId}:${a.storeId ?? "null"}:${a.quantity}`.localeCompare(`${b.productId}:${b.storeId ?? "null"}:${b.quantity}`));
        const canonical = JSON.stringify({ mode: parsed.mode, lines });
        return {
            mode: parsed.mode,
            lines,
            cartHash: (0, crypto_1.createHash)("sha256").update(canonical).digest("hex"),
        };
    }
    catch {
        return null;
    }
};
exports.parseCheckoutContext = parseCheckoutContext;
const sanitizeFileName = (fileName, quoteNumber) => {
    const baseName = path_1.default.basename(fileName || `${quoteNumber}.pdf`);
    const cleaned = baseName
        .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
        .slice(0, 240);
    return cleaned.toLowerCase().endsWith(".pdf")
        ? cleaned
        : `${cleaned || quoteNumber}.pdf`;
};
const parsePositiveId = (raw) => {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const retentionDays = () => {
    const configured = Number(process.env.COTIZACIONES_RETENTION_DAYS || 5);
    return Number.isInteger(configured) && configured >= 1 && configured <= 365
        ? configured
        : 5;
};
const quotaWhere = (userId, cartHash, since) => ({
    userId,
    cartHash,
    createdAt: { gte: since },
});
const quotaResponse = (count, oldestCreatedAt) => ({
    limit: QUOTE_LIMIT,
    remaining: Math.max(0, QUOTE_LIMIT - count),
    resetAt: new Date(oldestCreatedAt.getTime() + QUOTE_WINDOW_MS),
});
exports.quotaResponse = quotaResponse;
const createQuote = async (req, res) => {
    const uploadedFile = req.file;
    const temporaryPath = uploadedFile?.path;
    let finalPath = null;
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
        const idempotencyKey = String(Array.isArray(rawIdempotencyKey)
            ? rawIdempotencyKey[0]
            : rawIdempotencyKey || quoteNumber).trim();
        const totalAmount = Number(req.body.totalAmount);
        const itemCount = Number(req.body.itemCount);
        const includeAssemblyService = String(req.body.includeAssemblyService).toLowerCase() === "true";
        const checkout = (0, exports.parseCheckoutContext)(req.body.checkoutContext, itemCount);
        if (!QUOTE_NUMBER_PATTERN.test(quoteNumber) ||
            !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) ||
            !Number.isFinite(totalAmount) ||
            totalAmount < 0 ||
            totalAmount > 9_999_999_999.99 ||
            !Number.isInteger(itemCount) ||
            itemCount < 1 ||
            itemCount > 1_000 ||
            !checkout) {
            return res.status(400).json({
                ok: false,
                message: "Los metadatos de la cotizaci?n son inv?lidos",
            });
        }
        const sha256 = await (0, quoteStorage_service_1.validatePdfAndHash)(temporaryPath);
        const existing = await prismaClient_1.prisma.cotizaciones.findUnique({
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
            const sameRequest = existing.quoteNumber === quoteNumber &&
                existing.sha256 === sha256 &&
                existing.cartHash === checkout.cartHash &&
                existing.checkoutMode === checkout.mode &&
                Number(existing.totalAmount) === Number(totalAmount.toFixed(2)) &&
                existing.itemCount === itemCount &&
                existing.includeAssemblyService === includeAssemblyService;
            if (!sameRequest) {
                return res.status(409).json({
                    ok: false,
                    message: "La clave de idempotencia corresponde a otra cotizaci?n",
                });
            }
            return res.status(200).json({
                ok: true,
                message: "La cotizaci?n ya estaba guardada",
                data: serializeQuote(existing),
                quota: await (async () => {
                    const since = new Date(Date.now() - QUOTE_WINDOW_MS);
                    const where = quotaWhere(userId, checkout.cartHash, since);
                    const [count, oldest] = await Promise.all([
                        prismaClient_1.prisma.cotizaciones.count({ where }),
                        prismaClient_1.prisma.cotizaciones.findFirst({
                            where,
                            select: { createdAt: true },
                            orderBy: { createdAt: "asc" },
                        }),
                    ]);
                    return (0, exports.quotaResponse)(count, oldest?.createdAt || existing.createdAt);
                })(),
            });
        }
        const stored = await (0, quoteStorage_service_1.commitTemporaryQuote)(temporaryPath);
        finalPath = stored.finalPath;
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
        let transactionResult;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                transactionResult = await prismaClient_1.prisma.$transaction(async (tx) => {
                    const since = new Date(createdAt.getTime() - QUOTE_WINDOW_MS);
                    const where = quotaWhere(userId, checkout.cartHash, since);
                    const [count, oldest] = await Promise.all([
                        tx.cotizaciones.count({ where }),
                        tx.cotizaciones.findFirst({
                            where,
                            select: { createdAt: true },
                            orderBy: { createdAt: "asc" },
                        }),
                    ]);
                    if (count >= QUOTE_LIMIT) {
                        throw new QuoteLimitError(new Date((oldest?.createdAt || createdAt).getTime() + QUOTE_WINDOW_MS));
                    }
                    const created = await tx.cotizaciones.create({
                        data: {
                            quoteNumber,
                            idempotencyKey,
                            userId,
                            cartHash: checkout.cartHash,
                            checkoutMode: checkout.mode,
                            storageKey: stored.storageKey,
                            originalFileName: sanitizeFileName(uploadedFile.originalname, quoteNumber),
                            mimeType: "application/pdf",
                            sizeBytes: uploadedFile.size,
                            sha256,
                            totalAmount: new client_1.Prisma.Decimal(totalAmount.toFixed(2)),
                            itemCount,
                            includeAssemblyService,
                            linesJson: checkout.lines,
                            createdAt,
                            expiresAt,
                        },
                        select: quoteSelect,
                    });
                    return {
                        created,
                        quota: (0, exports.quotaResponse)(count + 1, oldest?.createdAt || createdAt),
                    };
                }, {
                    isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable,
                    maxWait: 5_000,
                    timeout: 10_000,
                });
                break;
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2034" &&
                    attempt < 2) {
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
    }
    catch (error) {
        if (error instanceof QuoteLimitError) {
            return res.status(429).json({
                ok: false,
                code: "QUOTE_LIMIT_REACHED",
                message: "Alcanzaste el l?mite de 3 cotizaciones para esta configuraci?n.",
                quota: {
                    limit: QUOTE_LIMIT,
                    remaining: 0,
                    resetAt: error.resetAt,
                },
            });
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2002") {
                return res.status(409).json({
                    ok: false,
                    message: "La cotizaci?n ya fue registrada",
                });
            }
        }
        if (error instanceof Error &&
            error.message.includes("firma PDF")) {
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
                    detail: error instanceof Error
                        ? error.message
                        : String(error?.message || error),
                    code: error instanceof client_1.Prisma.PrismaClientKnownRequestError
                        ? error.code
                        : undefined,
                }
                : {}),
        });
    }
    finally {
        if (temporaryPath) {
            await (0, quoteStorage_service_1.removeFileIfPresent)(temporaryPath).catch(() => undefined);
        }
        if (res.statusCode >= 400 && finalPath) {
            await (0, quoteStorage_service_1.removeFileIfPresent)(finalPath).catch(() => undefined);
        }
    }
};
exports.createQuote = createQuote;
const listAdminQuotes = async (req, res) => {
    try {
        const requestedPage = Number(req.query.page);
        const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const search = String(req.query.search || "").trim().slice(0, 100);
        const from = req.query.from ? new Date(String(req.query.from)) : null;
        const to = req.query.to ? new Date(String(req.query.to)) : null;
        if ((from && Number.isNaN(from.getTime())) ||
            (to && Number.isNaN(to.getTime()))) {
            return res.status(400).json({
                ok: false,
                message: "El rango de fechas es inv?lido",
            });
        }
        if (to)
            to.setUTCHours(23, 59, 59, 999);
        const where = {
            active: 1,
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
        const [records, total] = await prismaClient_1.prisma.$transaction([
            prismaClient_1.prisma.cotizaciones.findMany({
                where,
                select: quoteSelect,
                orderBy: [{ createdAt: "desc" }, { idCotizacion: "desc" }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
            }),
            prismaClient_1.prisma.cotizaciones.count({ where }),
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
    }
    catch {
        return res.status(500).json({
            ok: false,
            message: "No fue posible consultar las cotizaciones",
        });
    }
};
exports.listAdminQuotes = listAdminQuotes;
const streamAdminQuote = async (req, res) => {
    try {
        const idCotizacion = parsePositiveId(req.params.id);
        if (!idCotizacion) {
            return res.status(400).json({ ok: false, message: "Cotizaci?n inv?lida" });
        }
        const record = await prismaClient_1.prisma.cotizaciones.findFirst({
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
        const filePath = (0, quoteStorage_service_1.resolveQuotePath)(record.storageKey);
        const details = await (0, promises_1.stat)(filePath).catch(() => null);
        if (!details?.isFile()) {
            return res.status(404).json({
                ok: false,
                message: "El archivo de la cotizaci?n ya no est? disponible",
            });
        }
        const disposition = String(req.query.disposition).toLowerCase() === "attachment"
            ? "attachment"
            : "inline";
        const fileName = sanitizeFileName(record.originalFileName, "cotizacion");
        res.setHeader("Content-Type", record.mimeType);
        res.setHeader("Content-Length", details.size);
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("ETag", `"${record.sha256}"`);
        res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        const stream = (0, fs_1.createReadStream)(filePath);
        stream.on("error", () => {
            if (!res.headersSent)
                res.sendStatus(500);
            else
                res.destroy();
        });
        stream.pipe(res);
    }
    catch {
        return res.status(500).json({
            ok: false,
            message: "No fue posible obtener la cotizaci?n",
        });
    }
};
exports.streamAdminQuote = streamAdminQuote;
const archiveAdminQuote = async (req, res) => {
    try {
        const idCotizacion = parsePositiveId(req.params.id);
        if (!idCotizacion) {
            return res.status(400).json({ ok: false, message: "Cotizaci?n inv?lida" });
        }
        const record = await prismaClient_1.prisma.cotizaciones.findFirst({
            where: { idCotizacion, active: 1 },
            select: { storageKey: true },
        });
        if (!record) {
            return res.status(404).json({
                ok: false,
                message: "Cotizaci?n no encontrada o ya archivada",
            });
        }
        const archived = await prismaClient_1.prisma.cotizaciones.updateMany({
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
            await (0, quoteStorage_service_1.removeFileIfPresent)((0, quoteStorage_service_1.resolveQuotePath)(record.storageKey));
        }
        catch (fileError) {
            await prismaClient_1.prisma.cotizaciones
                .updateMany({
                where: { idCotizacion, active: 0 },
                data: { active: 1 },
            })
                .catch((rollbackError) => {
                console.error("No se pudo restaurar la cotizaci?n tras fallar el borrado del PDF", rollbackError);
            });
            throw fileError;
        }
        return res.status(200).json({
            ok: true,
            message: "Cotizaci?n archivada y PDF eliminado correctamente",
            data: { idCotizacion },
        });
    }
    catch (error) {
        console.error("No se pudo archivar la cotizaci?n y eliminar su PDF", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible archivar la cotizaci?n y eliminar su PDF",
        });
    }
};
exports.archiveAdminQuote = archiveAdminQuote;
//# sourceMappingURL=cotizaciones.controller.js.map