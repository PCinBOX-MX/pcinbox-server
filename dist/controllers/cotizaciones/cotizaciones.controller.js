"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveAdminQuote = exports.streamAdminQuote = exports.getAdminQuoteCostSummary = exports.listAdminQuotes = exports.getAdminQuoteProductAvailability = exports.unlinkAdminQuoteImport = exports.markAdminQuoteImported = exports.getAdminQuoteImport = exports.searchAdminQuoteProducts = exports.createAdminQuote = exports.createQuote = exports.quotaResponse = exports.parseCheckoutContext = void 0;
exports.buildQuoteStocksByBranch = buildQuoteStocksByBranch;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prismaClient_1 = require("../../db/prismaClient");
const quoteStorage_service_1 = require("../../services/quoteStorage.service");
const quotePdfClient_service_1 = require("../../services/quotePdfClient.service");
const quotePhoneCrypto_service_1 = require("../../services/quotePhoneCrypto.service");
const quoteLines_service_1 = require("../../services/quoteLines.service");
const adminQuoteCart_service_1 = require("../../services/adminQuoteCart.service");
const posCost_service_1 = require("../../services/pos/posCost.service");
const pcinbox_branch_display_1 = require("../../constants/pcinbox-branch-display");
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
};
const CAPTURED_PHONE_RE = /^\+\d{1,3}\s+\d{7,15}$/;
const sanitizeCapturedName = (raw) => {
    const value = String(raw || "")
        .replace(/[^\p{L}\p{N}\s.'\-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    return value || null;
};
const sanitizeCapturedPhone = (raw) => {
    const value = String(raw || "").trim().slice(0, 32);
    if (!value)
        return null;
    if (CAPTURED_PHONE_RE.test(value))
        return value;
    const match = value.match(/^(\+\d{1,3}\s+\d{7,15})/);
    return match?.[1] || null;
};
const accountCustomer = (users) => {
    if (!users) {
        return { name: null, email: null, phone: null };
    }
    const name = [users.name, users.lastname].filter(Boolean).join(" ").trim();
    return {
        name: name || null,
        email: users.email || null,
        phone: users.phone || null,
    };
};
const serializeQuote = (quote) => {
    const { users, cartHash: _cart, active: _active, storageKey: _storageKey, capturedName: _capturedName, capturedPhone: _capturedPhone, ...safe } = quote;
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
const serializeQuoteWithPdfCustomer = async (quote) => {
    const base = serializeQuote(quote);
    const capturedName = String(quote.capturedName || "").trim();
    const capturedPhone = String(quote.capturedPhone || "").trim();
    if (capturedName || capturedPhone) {
        const phonePlain = capturedPhone
            ? (0, quotePhoneCrypto_service_1.decryptCapturedPhone)(capturedPhone)
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
    let pdfClient = await (0, quotePdfClient_service_1.readQuotePdfClientIdentityLight)(quote.storageKey);
    // Keywords indirectos / PDFs viejos: leer bloque Cliente del PDF.
    if (!pdfClient) {
        pdfClient = await (0, quotePdfClient_service_1.readQuotePdfClientIdentity)(quote.storageKey);
    }
    const fromPdf = (0, quotePdfClient_service_1.resolvePosCustomerFromPdf)(pdfClient);
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
            const unitPriceRaw = line.unitPrice === null ||
                line.unitPrice === undefined ||
                line.unitPrice === ""
                ? null
                : Number(line.unitPrice);
            const unitPrice = unitPriceRaw === null
                ? null
                : Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0
                    ? Math.round((unitPriceRaw + Number.EPSILON) * 100) / 100
                    : NaN;
            const manual = line.manual === true;
            const name = String(line.name ?? "").trim().slice(0, 180);
            const upc = String(line.upc ?? "")
                .trim()
                .replace(/\s+/g, "")
                .slice(0, 32);
            if (!productId ||
                productId.length > 64 ||
                !Number.isInteger(quantity) ||
                quantity < 1 ||
                quantity > 1_000 ||
                (storeId !== null &&
                    (!Number.isSafeInteger(storeId) || storeId < 0)) ||
                (unitPrice !== null && !Number.isFinite(unitPrice)) ||
                (manual && name.length < 2)) {
                throw new Error("L?nea inv?lida");
            }
            return {
                productId,
                quantity,
                storeId,
                unitPrice,
                ...(manual ? { manual: true, name, upc: upc || null } : {}),
            };
        });
        const assemblyRaw = parsed.assemblyPrice;
        let assemblyPrice = null;
        if (assemblyRaw != null && assemblyRaw !== "") {
            const amount = Number(assemblyRaw);
            if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
                throw new Error("Precio de ensamble inv?lido");
            }
            assemblyPrice = Math.round((amount + Number.EPSILON) * 100) / 100;
        }
        const deliveries = (0, quoteLines_service_1.parseQuoteDeliveries)(Object.prototype.hasOwnProperty.call(parsed, "deliveries")
            ? parsed.deliveries
            : null);
        if (!deliveries) {
            throw new Error("Domicilio de envío inválido");
        }
        const comments = (0, quoteLines_service_1.parseQuoteComments)(Object.prototype.hasOwnProperty.call(parsed, "comments")
            ? parsed.comments
            : null);
        if (comments == null) {
            throw new Error("Comentarios inválidos");
        }
        if (!Number.isFinite(expectedItemCount) ||
            lines.reduce((total, line) => total + line.quantity, 0) !==
                Math.round(expectedItemCount)) {
            return null;
        }
        // El hash no depende del orden. Las líneas que se guardan sí: el PDF
        // y la importación en admin deben seguir el orden en que se agregaron.
        // Los comentarios no entran al hash: no deben gastar cupo de cuota.
        const hashLines = [...lines]
            .sort((a, b) => `${a.productId}:${a.storeId ?? "null"}:${a.quantity}`.localeCompare(`${b.productId}:${b.storeId ?? "null"}:${b.quantity}`))
            .map(({ productId, quantity, storeId, manual, name, upc }) => ({
            productId,
            quantity,
            storeId,
            ...(manual ? { manual: true, name, upc: upc || "" } : {}),
        }));
        const canonical = JSON.stringify({
            mode: parsed.mode,
            lines: hashLines,
            ...(assemblyPrice ? { assemblyPrice } : {}),
            ...(deliveries.length ? { deliveries } : {}),
        });
        return {
            mode: parsed.mode,
            lines,
            cartHash: (0, crypto_1.createHash)("sha256").update(canonical).digest("hex"),
            equipmentCount: (0, quoteLines_service_1.normalizeEquipmentCount)(parsed.equipmentCount),
            assemblyPrice,
            deliveries,
            comments,
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
const saveUploadedQuote = async (req, res, _source) => {
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
        const capturedName = sanitizeCapturedName(req.body.capturedName);
        const capturedPhonePlain = sanitizeCapturedPhone(req.body.capturedPhone);
        let capturedPhone = null;
        if (capturedPhonePlain) {
            try {
                capturedPhone = (0, quotePhoneCrypto_service_1.encryptCapturedPhone)(capturedPhonePlain);
            }
            catch (error) {
                console.error("No se pudo cifrar el teléfono de la cotización", error);
                return res.status(500).json({
                    ok: false,
                    message: "No fue posible guardar el teléfono de la cotización",
                });
            }
        }
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
        // Solo identidad/qty/bodega en DB; precios cotizados viven en Keywords del PDF.
        const linesForStorage = checkout.lines.map(({ productId, quantity, storeId, manual, name, upc }) => ({
            productId,
            quantity,
            storeId,
            ...(manual ? { manual: true, name, upc: upc || null } : {}),
        }));
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
                            linesJson: {
                                lines: linesForStorage,
                                ...(checkout.equipmentCount > 1
                                    ? { equipmentCount: checkout.equipmentCount }
                                    : {}),
                                ...(checkout.assemblyPrice
                                    ? { assemblyPrice: checkout.assemblyPrice }
                                    : {}),
                                ...(checkout.deliveries.length
                                    ? { deliveries: checkout.deliveries }
                                    : {}),
                                ...(checkout.comments
                                    ? { comments: checkout.comments }
                                    : {}),
                            },
                            capturedName,
                            capturedPhone,
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
const createQuote = (req, res) => saveUploadedQuote(req, res, "client");
exports.createQuote = createQuote;
const createAdminQuote = (req, res) => saveUploadedQuote(req, res, "admin");
exports.createAdminQuote = createAdminQuote;
const parseCaracteristicas = (raw) => {
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return [];
};
const quotePcKind = (caracteristicas) => {
    const tipo = parseCaracteristicas(caracteristicas).find((item) => {
        if (!item || typeof item !== "object")
            return false;
        return String(item.prop || "").trim().toLowerCase() === "tipo";
    });
    const value = String(tipo?.value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    if (value === "workstation")
        return "Workstation";
    if (value === "pro" || value === "intermedia" || value === "entrada")
        return "PC Gamer";
    return "PC";
};
const quotePcTipoNeedles = (query) => {
    const text = query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    if (/^(pc|pcs|pc gamer|pcs gamer|gamer|gamers|computadora|computadoras)$/.test(text)) {
        return ["pro", "intermedia", "entrada"];
    }
    if (/^(workstation|workstations|work station|estacion|estacion de trabajo|estaciones de trabajo)$/.test(text)) {
        return ["workStation"];
    }
    return [];
};
const QUOTE_BRANCH_ORDER = {
    [pcinbox_branch_display_1.DICOTECH_PROVIDER_ID]: ["santafe", "leon2"],
    [pcinbox_branch_display_1.TECHSMART_PROVIDER_ID]: ["gdl", "cdmx"],
};
function buildQuoteStocksByBranch(providerId, branches, stockByBranch) {
    const restricted = QUOTE_BRANCH_ORDER[providerId];
    return branches
        .filter((branch) => {
        const sameProvider = Number(branch.providerId) === providerId;
        if (restricted) {
            return sameProvider && (0, pcinbox_branch_display_1.isPosSellableBranchName)(providerId, branch.name);
        }
        return sameProvider || stockByBranch.has(String(branch.idBranche));
    })
        .map((branch) => {
        const name = String(branch.name || "").trim();
        const city = String(branch.city || "").trim();
        return {
            branchId: Number(branch.idBranche),
            rawName: name,
            label: (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(name) ||
                city ||
                `Bodega ${branch.idBranche}`,
            stock: stockByBranch.get(String(branch.idBranche)) ?? 0,
        };
    })
        .sort((a, b) => {
        if (restricted) {
            const rank = (rawName) => {
                const key = (0, pcinbox_branch_display_1.normalizePosBranchKey)(rawName);
                const index = restricted.findIndex((name) => (0, pcinbox_branch_display_1.normalizePosBranchKey)(name) === key);
                return index === -1 ? restricted.length : index;
            };
            return rank(a.rawName) - rank(b.rawName);
        }
        return b.stock - a.stock || a.label.localeCompare(b.label, "es");
    })
        .map(({ branchId, label, stock }) => ({ branchId, label, stock }));
}
async function loadQuoteStockSnapshots(products) {
    const snapshots = new Map();
    if (products.length === 0)
        return snapshots;
    const productIds = products.map((product) => product.idProduct);
    const providerIds = [...new Set(products.map((product) => product.providerId))];
    const [branchRows, stockRows] = await Promise.all([
        prismaClient_1.prisma.branches.findMany({
            where: { providerId: { in: providerIds } },
            select: {
                idBranche: true,
                name: true,
                city: true,
                providerId: true,
            },
            orderBy: { name: "asc" },
        }),
        prismaClient_1.prisma.product_stock.findMany({
            where: { productId: { in: productIds } },
            select: { productId: true, branchId: true, stock: true },
        }),
    ]);
    const extraBranchIds = stockRows
        .map((row) => row.branchId)
        .filter((branchId) => !branchRows.some((branch) => branch.idBranche === branchId));
    const extraBranches = extraBranchIds.length
        ? await prismaClient_1.prisma.branches.findMany({
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
    const stockByProduct = new Map();
    for (const row of stockRows) {
        const productKey = String(row.productId);
        const byBranch = stockByProduct.get(productKey) ?? new Map();
        byBranch.set(String(row.branchId), Number(row.stock ?? 0));
        stockByProduct.set(productKey, byBranch);
    }
    for (const product of products) {
        const byBranch = stockByProduct.get(String(product.idProduct)) ?? new Map();
        const stocksByBranch = buildQuoteStocksByBranch(Number(product.providerId), branches, byBranch);
        const branchTotal = stocksByBranch.reduce((sum, branch) => sum + branch.stock, 0);
        snapshots.set(String(product.idProduct), {
            active: product.active === 1,
            stock: stocksByBranch.length > 0 ? branchTotal : Number(product.stock ?? 0),
            stocksByBranch,
        });
    }
    return snapshots;
}
const searchAdminQuoteProducts = async (req, res) => {
    try {
        const q = String(req.query.q || "").trim().slice(0, 80);
        if (q.length < 2) {
            return res.status(200).json({ ok: true, data: [] });
        }
        const numericId = /^\d+$/.test(q) ? Number(q) : null;
        const idMatch = numericId && Number.isSafeInteger(numericId) && numericId > 0
            ? [{ idProduct: BigInt(numericId) }]
            : [];
        const tokens = q.split(/\s+/).filter((token) => token.length >= 2);
        const nameTokens = tokens.length >= 2
            ? [{ AND: tokens.map((token) => ({ name: { contains: token } })) }]
            : [];
        const select = {
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
            isPC: true,
        };
        const [components, pcs] = await Promise.all([
            prismaClient_1.prisma.products.findMany({
                where: {
                    AND: [
                        { OR: [{ isPC: null }, { isPC: { not: 1 } }] },
                        {
                            OR: [
                                { name: { contains: q } },
                                { sku: { startsWith: q } },
                                { upc: { startsWith: q } },
                                { idProductExt: { startsWith: q } },
                                ...idMatch,
                                ...nameTokens,
                            ],
                        },
                    ],
                },
                select,
                orderBy: { name: "asc" },
                take: 10,
            }),
            prismaClient_1.prisma.products.findMany({
                where: {
                    isPC: 1,
                    OR: [
                        { name: { contains: q } },
                        { description: { contains: q } },
                        { sku: { startsWith: q } },
                        { upc: { startsWith: q } },
                        { idProductExt: { startsWith: q } },
                        { caracteristicas: { string_contains: q } },
                        ...idMatch,
                        ...nameTokens,
                        ...quotePcTipoNeedles(q).map((needle) => ({
                            caracteristicas: { string_contains: needle },
                        })),
                    ],
                },
                select,
                orderBy: { name: "asc" },
                take: 8,
            }),
        ]);
        const seen = new Set(components.map((product) => String(product.idProduct)));
        const products = [
            ...components,
            ...pcs.filter((product) => !seen.has(String(product.idProduct))),
        ];
        const snapshots = await loadQuoteStockSnapshots(products);
        return res.status(200).json({
            ok: true,
            data: products.map((product) => {
                const snapshot = snapshots.get(String(product.idProduct));
                const isPc = product.isPC === 1;
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
                    kind: isPc ? quotePcKind(product.caracteristicas) : null,
                };
            }),
        });
    }
    catch (error) {
        console.error("[searchAdminQuoteProducts]", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible buscar productos",
        });
    }
};
exports.searchAdminQuoteProducts = searchAdminQuoteProducts;
const getAdminQuoteImport = async (req, res) => {
    try {
        const quoteNumber = (0, quoteLines_service_1.normalizeQuoteNumber)(req.params.quoteNumber);
        if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
            return res.status(400).json({
                ok: false,
                message: "El número de cotización no es válido.",
            });
        }
        const quote = await prismaClient_1.prisma.cotizaciones.findFirst({
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
                message: "No se encontró esa cotización. Revisa el número o genera una nueva.",
            });
        }
        if (quote.active !== 1 || quote.expiresAt.getTime() < Date.now()) {
            return res.status(410).json({
                ok: false,
                message: "Esa cotización ya no está disponible. Venció o fue archivada.",
            });
        }
        const payload = (0, quoteLines_service_1.readStoredQuoteLinesPayload)(quote.linesJson);
        if (!payload?.lines.length) {
            return res.status(400).json({
                ok: false,
                message: "Esa cotización no tiene productos para importar.",
            });
        }
        if (payload.importedAt) {
            const userId = Number(req.idUser);
            const cartIsEmpty = Number.isSafeInteger(userId) &&
                userId > 0 &&
                (await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId)).length === 0;
            if (!cartIsEmpty) {
                return res.status(409).json({
                    ok: false,
                    message: "Esta cotización ya fue importada. No se puede volver a cargar el mismo número.",
                });
            }
        }
        const storedLines = payload.lines;
        const catalogStored = storedLines.filter((line) => line.manual !== true);
        const manualStored = storedLines.filter((line) => line.manual === true);
        const productIds = [
            ...new Set(catalogStored
                .map((line) => Number(line.productId))
                .filter((id) => Number.isSafeInteger(id) && id > 0)),
        ].slice(0, 100);
        const products = productIds.length
            ? await prismaClient_1.prisma.products.findMany({
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
        const [quotedPrices, pdfExtras] = await Promise.all([
            (0, quotePdfClient_service_1.readQuotePdfLinePrices)(quote.storageKey),
            (0, quotePdfClient_service_1.readQuotePdfSaleExtras)(quote.storageKey),
        ]);
        const byId = new Map(products.map((product) => [Number(product.idProduct), product]));
        let missing = 0;
        const catalogLines = catalogStored.flatMap((line) => {
            const idProduct = Number(line.productId);
            if (!Number.isSafeInteger(idProduct) || idProduct <= 0)
                return [];
            const quantity = Math.min(999, Math.max(1, Math.round(line.quantity)));
            const quotedPrice = quotedPrices.get(idProduct);
            const product = byId.get(idProduct);
            if (!product) {
                missing += 1;
                return [
                    {
                        idProduct,
                        name: `Producto #${idProduct}`,
                        description: null,
                        caracteristicas: null,
                        price: quotedPrice ?? 0,
                        image_url: null,
                        upc: null,
                        sku: null,
                        active: false,
                        stock: 0,
                        stocksByBranch: [],
                        quantity,
                        manual: false,
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
                    manual: false,
                },
            ];
        });
        const usedIds = new Set(catalogLines.map((line) => line.idProduct));
        const manualLines = manualStored.flatMap((line, index) => {
            const pdf = pdfExtras.manualById.get(line.productId);
            const name = String(line.name || pdf?.name || "").trim().slice(0, 180);
            if (name.length < 2)
                return [];
            const quantity = Math.min(999, Math.max(1, Math.round(pdf?.quantity || line.quantity || 1)));
            const unitPrice = pdf?.unitPrice != null && Number.isFinite(pdf.unitPrice)
                ? pdf.unitPrice
                : 0;
            let idProduct = Number(line.productId);
            if (!Number.isSafeInteger(idProduct) || idProduct <= 0 || usedIds.has(idProduct)) {
                idProduct = Date.now() + index;
                while (usedIds.has(idProduct))
                    idProduct += 1;
            }
            usedIds.add(idProduct);
            return [
                {
                    idProduct,
                    name,
                    description: null,
                    caracteristicas: null,
                    price: unitPrice,
                    image_url: "/producto-sin-foto.jpg",
                    upc: line.upc || pdf?.upc || null,
                    sku: null,
                    active: true,
                    stock: 0,
                    stocksByBranch: [],
                    quantity,
                    manual: true,
                },
            ];
        });
        const lines = [...catalogLines, ...manualLines];
        if (lines.length === 0) {
            return res.status(400).json({
                ok: false,
                message: "Esa cotización no tiene productos para importar.",
            });
        }
        let customerPhone = "";
        if (quote.capturedPhone) {
            try {
                customerPhone = (0, quotePhoneCrypto_service_1.decryptCapturedPhone)(quote.capturedPhone) || "";
            }
            catch {
                customerPhone = "";
            }
        }
        const capturedName = String(quote.capturedName || "").trim();
        const customerName = capturedName.toLowerCase() === "venta público general" ? "" : capturedName;
        const assemblyPrice = payload.assemblyPrice ?? pdfExtras.assemblyPrice ?? null;
        const deliveries = payload.deliveries || [];
        const comments = payload.comments || "";
        return res.status(200).json({
            ok: true,
            data: {
                quoteNumber: quote.quoteNumber,
                customerName,
                customerPhone,
                includeAssembly: quote.includeAssemblyService === true ||
                    (assemblyPrice != null && assemblyPrice > 0),
                assemblyPrice,
                equipmentCount: payload.equipmentCount || 1,
                deliveries,
                comments,
                missing,
                lines,
            },
        });
    }
    catch (error) {
        console.error("[getAdminQuoteImport]", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible importar la cotización.",
        });
    }
};
exports.getAdminQuoteImport = getAdminQuoteImport;
const markAdminQuoteImported = async (req, res) => {
    try {
        const quoteNumber = (0, quoteLines_service_1.normalizeQuoteNumber)(req.params.quoteNumber);
        if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
            return res.status(400).json({
                ok: false,
                message: "El número de cotización no es válido.",
            });
        }
        const userId = Number(req.idUser);
        const quote = await prismaClient_1.prisma.cotizaciones.findFirst({
            where: { quoteNumber },
            select: { idCotizacion: true, linesJson: true },
        });
        if (!quote) {
            return res.status(404).json({
                ok: false,
                message: "No se encontró esa cotización.",
            });
        }
        const payload = (0, quoteLines_service_1.readStoredQuoteLinesPayload)(quote.linesJson);
        if (!payload?.lines.length) {
            return res.status(400).json({
                ok: false,
                message: "Esa cotización no tiene productos para importar.",
            });
        }
        if (!payload.importedAt) {
            await prismaClient_1.prisma.cotizaciones.update({
                where: { idCotizacion: quote.idCotizacion },
                data: {
                    linesJson: (0, quoteLines_service_1.buildImportedLinesJson)(payload.lines, Number.isSafeInteger(userId) && userId > 0 ? userId : 0, payload.equipmentCount, payload.assemblyPrice, payload.deliveries, payload.comments),
                },
            });
        }
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("[markAdminQuoteImported]", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible registrar la importación de la cotización.",
        });
    }
};
exports.markAdminQuoteImported = markAdminQuoteImported;
const unlinkAdminQuoteImport = async (req, res) => {
    try {
        const quoteNumber = (0, quoteLines_service_1.normalizeQuoteNumber)(req.params.quoteNumber);
        if (!QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
            return res.status(400).json({
                ok: false,
                message: "El número de cotización no es válido.",
            });
        }
        const userId = Number(req.idUser);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(401).json({ ok: false, message: "Debes iniciar sesión." });
        }
        const quote = await prismaClient_1.prisma.cotizaciones.findFirst({
            where: { quoteNumber },
            select: { idCotizacion: true, quoteNumber: true, linesJson: true },
        });
        if (!quote) {
            return res.status(404).json({
                ok: false,
                message: "No se encontró esa cotización.",
            });
        }
        const payload = (0, quoteLines_service_1.readStoredQuoteLinesPayload)(quote.linesJson);
        if (!payload?.lines.length) {
            return res.status(400).json({
                ok: false,
                message: "Esa cotización no tiene productos para quitar.",
            });
        }
        const productIds = [
            ...new Set(payload.lines
                .map((line) => Number(line.productId))
                .filter((id) => Number.isSafeInteger(id) && id > 0)),
        ];
        const ids = new Set(productIds);
        const current = await (0, adminQuoteCart_service_1.readAdminQuoteCart)(userId);
        const next = current.filter((line) => !ids.has(line.idProduct));
        (0, adminQuoteCart_service_1.forgetAdminQuoteImport)(userId, quote.quoteNumber);
        await (0, adminQuoteCart_service_1.writeAdminQuoteCart)(userId, next);
        if (payload.importedAt) {
            await prismaClient_1.prisma.cotizaciones.update({
                where: { idCotizacion: quote.idCotizacion },
                data: {
                    linesJson: {
                        lines: payload.lines,
                        ...(payload.equipmentCount > 1
                            ? { equipmentCount: payload.equipmentCount }
                            : {}),
                        ...(payload.assemblyPrice
                            ? { assemblyPrice: payload.assemblyPrice }
                            : {}),
                        ...(payload.deliveries.length
                            ? { deliveries: payload.deliveries }
                            : {}),
                        ...(payload.comments ? { comments: payload.comments } : {}),
                    },
                },
            });
        }
        const page = Math.trunc(Number(req.body?.page));
        return res.status(200).json({
            ok: true,
            quoteNumber: quote.quoteNumber,
            removed: current.length - next.length,
            productIds,
            importedQuotes: (0, adminQuoteCart_service_1.listAdminImportedQuoteNumbers)(userId),
            ...(0, adminQuoteCart_service_1.sliceQuoteCart)(next, Number.isInteger(page) && page > 0 ? page : 1),
        });
    }
    catch (error) {
        console.error("[unlinkAdminQuoteImport]", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible desvincular la cotización.",
        });
    }
};
exports.unlinkAdminQuoteImport = unlinkAdminQuoteImport;
const getAdminQuoteProductAvailability = async (req, res) => {
    try {
        const ids = [
            ...new Set(String(req.query.ids || "")
                .split(",")
                .map((part) => Number(part.trim()))
                .filter((id) => Number.isSafeInteger(id) && id > 0)),
        ].slice(0, 100);
        if (ids.length === 0) {
            return res.status(200).json({ ok: true, data: [] });
        }
        const products = await prismaClient_1.prisma.products.findMany({
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
    }
    catch (error) {
        console.error("[getAdminQuoteProductAvailability]", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible consultar el stock de los productos",
        });
    }
};
exports.getAdminQuoteProductAvailability = getAdminQuoteProductAvailability;
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
        // El Cliente de la UI sale del PDF; con búsqueda hay que filtrar tras enriquecer.
        const baseWhere = {
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
            const [records, total] = await prismaClient_1.prisma.$transaction([
                prismaClient_1.prisma.cotizaciones.findMany({
                    where: baseWhere,
                    select: quoteSelect,
                    orderBy: [{ createdAt: "desc" }, { idCotizacion: "desc" }],
                    skip: (page - 1) * PAGE_SIZE,
                    take: PAGE_SIZE,
                }),
                prismaClient_1.prisma.cotizaciones.count({ where: baseWhere }),
            ]);
            const data = await Promise.all(records.map((record) => serializeQuoteWithPdfCustomer(record)));
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
        const pool = await prismaClient_1.prisma.cotizaciones.findMany({
            where: baseWhere,
            select: quoteSelect,
            orderBy: [{ createdAt: "desc" }, { idCotizacion: "desc" }],
            take: SEARCH_POOL_LIMIT,
        });
        const enriched = await Promise.all(pool.map((record) => serializeQuoteWithPdfCustomer(record)));
        const needle = search.toLowerCase();
        const needleDigits = search.replace(/\D/g, "");
        const filtered = enriched.filter((item) => {
            const name = String(item.customer?.name || "").toLowerCase();
            const email = String(item.customer?.email || "").toLowerCase();
            const phone = String(item.customer?.phone || "").toLowerCase();
            const phoneDigits = phone.replace(/\D/g, "");
            const folio = String(item.quoteNumber || "").toLowerCase();
            const file = String(item.originalFileName || "").toLowerCase();
            if (folio.includes(needle) ||
                file.includes(needle) ||
                name.includes(needle) ||
                email.includes(needle) ||
                phone.includes(needle)) {
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
    }
    catch {
        return res.status(500).json({
            ok: false,
            message: "No fue posible consultar las cotizaciones",
        });
    }
};
exports.listAdminQuotes = listAdminQuotes;
/** Inversión, margen y costo cobrado. No se imprime en el PDF. */
const getAdminQuoteCostSummary = async (req, res) => {
    try {
        const rawId = String(req.params.id || "").trim();
        const idCotizacion = parsePositiveId(rawId);
        if (!idCotizacion && !rawId) {
            return res.status(400).json({
                ok: false,
                message: "La cotización no es válida.",
            });
        }
        // Acepta id interno o número de cotización (el listado muestra ambos).
        const quote = await prismaClient_1.prisma.cotizaciones.findFirst({
            where: {
                active: 1,
                OR: [
                    ...(idCotizacion ? [{ idCotizacion }] : []),
                    ...(rawId ? [{ quoteNumber: rawId }] : []),
                ],
            },
            select: { linesJson: true, storageKey: true },
        });
        if (!quote) {
            return res.status(404).json({
                ok: false,
                message: "No se encontró esa cotización.",
            });
        }
        const payload = (0, quoteLines_service_1.readStoredQuoteLinesPayload)(quote.linesJson);
        const equipmentCount = payload?.equipmentCount ?? 1;
        const storedLines = payload?.lines ?? [];
        const ids = [
            ...new Set(storedLines
                .map((line) => Number(line.productId))
                .filter((id) => Number.isSafeInteger(id) && id > 0)),
        ].slice(0, 200);
        const [costs, providerIds, prices] = await Promise.all([
            (0, posCost_service_1.loadPosUnitCostsByProductIds)(ids),
            (0, posCost_service_1.loadPosCostProviderProductIds)(ids),
            (0, quotePdfClient_service_1.readQuotePdfLinePrices)(quote.storageKey),
        ]);
        let missingCount = 0;
        const charged = [];
        for (const line of storedLines) {
            if (line.manual)
                continue;
            const productId = Number(line.productId);
            if (!providerIds.has(productId))
                continue;
            const cost = costs.get(productId);
            const unitPrice = prices.get(productId);
            if (!cost || unitPrice == null || !Number.isFinite(unitPrice)) {
                missingCount += 1;
                continue;
            }
            const quantity = line.quantity * equipmentCount;
            charged.push({
                quantity,
                costUnit: cost.costUnit,
                profitMarginUnit: cost.profitMarginUnit,
                lineTotal: Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100,
            });
        }
        return res.json({
            ok: true,
            data: {
                summary: (0, posCost_service_1.summarizePosCosts)(charged),
                missingCount,
                equipmentCount,
            },
        });
    }
    catch (error) {
        console.error("[getAdminQuoteCostSummary]", error);
        return res.status(500).json({
            ok: false,
            message: "No fue posible calcular la inversión de la cotización.",
        });
    }
};
exports.getAdminQuoteCostSummary = getAdminQuoteCostSummary;
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