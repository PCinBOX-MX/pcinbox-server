"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const cotizaciones_controller_1 = require("../../controllers/cotizaciones/cotizaciones.controller");
const index_middleware_1 = require("../../middleware/index.middleware");
const quoteStorage_service_1 = require("../../services/quoteStorage.service");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, callback) => {
            void (0, quoteStorage_service_1.ensureQuoteStorage)()
                .then(() => callback(null, (0, quoteStorage_service_1.getQuoteTempDirectory)()))
                .catch((error) => callback(error, ""));
        },
        filename: (_req, _file, callback) => callback(null, (0, quoteStorage_service_1.createTemporaryQuoteName)()),
    }),
    limits: {
        files: 1,
        fileSize: quoteStorage_service_1.MAX_QUOTE_FILE_SIZE,
        fieldSize: 64 * 1024,
        fields: 10,
    },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype !== "application/pdf") {
            callback(new Error("Solo se permiten archivos PDF"));
            return;
        }
        callback(null, true);
    },
});
const uploadQuotePdf = (req, res, next) => {
    upload.single("file")(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        const isLimit = error instanceof multer_1.default.MulterError;
        res.status(400).json({
            ok: false,
            message: isLimit
                ? "El PDF excede el límite permitido o la solicitud es inválida"
                : error instanceof Error
                    ? error.message
                    : "No fue posible recibir el PDF",
        });
    });
};
router.post("/", index_middleware_1.MiddleAuthRoute, uploadQuotePdf, cotizaciones_controller_1.createQuote);
router.get("/admin", index_middleware_1.MiddleAuthRoute, index_middleware_1.MiddleAdminRoute, cotizaciones_controller_1.listAdminQuotes);
router.get("/admin/:id/content", index_middleware_1.MiddleAuthRoute, index_middleware_1.MiddleAdminRoute, cotizaciones_controller_1.streamAdminQuote);
router.delete("/admin/:id", index_middleware_1.MiddleAuthRoute, index_middleware_1.MiddleAdminRoute, cotizaciones_controller_1.archiveAdminQuote);
exports.default = router;
//# sourceMappingURL=cotizaciones.route.js.map