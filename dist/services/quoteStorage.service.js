"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFileIfPresent = exports.commitTemporaryQuote = exports.validatePdfAndHash = exports.resolveQuotePath = exports.createTemporaryQuoteName = exports.ensureQuoteStorage = exports.getQuoteTempDirectory = exports.getQuoteStorageRoot = exports.MAX_QUOTE_FILE_SIZE = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const PDF_SIGNATURE = Buffer.from("%PDF-");
exports.MAX_QUOTE_FILE_SIZE = 15 * 1024 * 1024;
const getStorageEnvironment = () => {
    const environment = (process.env.COTIZACIONES_ENV ||
        process.env.NODE_ENV ||
        "local").toLowerCase();
    if (environment === "production")
        return "prod";
    if (environment === "development")
        return "local";
    return ["local", "qa", "prod"].includes(environment) ? environment : "local";
};
const getQuoteStorageRoot = () => {
    const configured = process.env.COTIZACIONES_STORAGE_DIR?.trim();
    if (configured)
        return path_1.default.resolve(configured);
    return path_1.default.resolve("/var/www/pcinbox", getStorageEnvironment(), "cotizaciones");
};
exports.getQuoteStorageRoot = getQuoteStorageRoot;
const getQuoteTempDirectory = () => path_1.default.join((0, exports.getQuoteStorageRoot)(), ".tmp");
exports.getQuoteTempDirectory = getQuoteTempDirectory;
const ensureQuoteStorage = async () => {
    await (0, promises_1.mkdir)((0, exports.getQuoteStorageRoot)(), { recursive: true, mode: 0o750 });
    await (0, promises_1.mkdir)((0, exports.getQuoteTempDirectory)(), { recursive: true, mode: 0o750 });
};
exports.ensureQuoteStorage = ensureQuoteStorage;
const createTemporaryQuoteName = () => `${(0, crypto_1.randomUUID)()}.upload`;
exports.createTemporaryQuoteName = createTemporaryQuoteName;
const assertStorageKey = (storageKey) => {
    if (!/^[a-f0-9-]{36}$/.test(storageKey)) {
        throw new Error("Clave de almacenamiento inválida");
    }
};
const resolveQuotePath = (storageKey) => {
    assertStorageKey(storageKey);
    const root = (0, exports.getQuoteStorageRoot)();
    const target = path_1.default.resolve(root, `${storageKey}.pdf`);
    if (!target.startsWith(`${root}${path_1.default.sep}`)) {
        throw new Error("Ruta de cotización inválida");
    }
    return target;
};
exports.resolveQuotePath = resolveQuotePath;
const validatePdfAndHash = async (temporaryPath) => {
    const file = await (0, promises_1.open)(temporaryPath, "r");
    try {
        const signature = Buffer.alloc(PDF_SIGNATURE.length);
        const { bytesRead } = await file.read(signature, 0, PDF_SIGNATURE.length, 0);
        if (bytesRead !== PDF_SIGNATURE.length ||
            !signature.equals(PDF_SIGNATURE)) {
            throw new Error("El archivo no contiene una firma PDF válida");
        }
    }
    finally {
        await file.close();
    }
    const hash = (0, crypto_1.createHash)("sha256");
    await new Promise((resolve, reject) => {
        const stream = (0, fs_1.createReadStream)(temporaryPath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
    });
    return hash.digest("hex");
};
exports.validatePdfAndHash = validatePdfAndHash;
const commitTemporaryQuote = async (temporaryPath) => {
    const storageKey = (0, crypto_1.randomUUID)();
    const finalPath = (0, exports.resolveQuotePath)(storageKey);
    await (0, promises_1.rename)(temporaryPath, finalPath);
    await (0, promises_1.chmod)(finalPath, 0o640);
    return { storageKey, finalPath };
};
exports.commitTemporaryQuote = commitTemporaryQuote;
const removeFileIfPresent = async (filePath) => {
    await (0, promises_1.unlink)(filePath).catch((error) => {
        if (error.code !== "ENOENT")
            throw error;
    });
};
exports.removeFileIfPresent = removeFileIfPresent;
//# sourceMappingURL=quoteStorage.service.js.map