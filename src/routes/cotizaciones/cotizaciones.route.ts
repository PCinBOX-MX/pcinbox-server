import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import {
  createQuote,
  deleteAdminQuote,
  listAdminQuotes,
  streamAdminQuote,
} from "../../controllers/cotizaciones/cotizaciones.controller";
import {
  MiddleAdminRoute,
  MiddleAuthRoute,
  MiddleOptionalAuthRoute,
} from "../../middleware/index.middleware";
import {
  createTemporaryQuoteName,
  ensureQuoteStorage,
  getQuoteTempDirectory,
  MAX_QUOTE_FILE_SIZE,
} from "../../services/quoteStorage.service";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      void ensureQuoteStorage()
        .then(() => callback(null, getQuoteTempDirectory()))
        .catch((error) => callback(error, ""));
    },
    filename: (_req, _file, callback) =>
      callback(null, createTemporaryQuoteName()),
  }),
  limits: {
    files: 1,
    fileSize: MAX_QUOTE_FILE_SIZE,
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

const uploadQuotePdf = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    const isLimit = error instanceof multer.MulterError;
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

router.post("/", MiddleOptionalAuthRoute, uploadQuotePdf, createQuote);
router.get("/admin", MiddleAuthRoute, MiddleAdminRoute, listAdminQuotes);
router.get(
  "/admin/:id/content",
  MiddleAuthRoute,
  MiddleAdminRoute,
  streamAdminQuote,
);
router.delete(
  "/admin/:id",
  MiddleAuthRoute,
  MiddleAdminRoute,
  deleteAdminQuote,
);

export default router;
