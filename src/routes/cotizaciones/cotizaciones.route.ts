import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import {
  createQuote,
  createAdminQuote,
  archiveAdminQuote,
  getAdminQuoteImport,
  getAdminQuoteProductAvailability,
  listAdminQuotes,
  markAdminQuoteImported,
  searchAdminQuoteProducts,
  streamAdminQuote,
} from "../../controllers/cotizaciones/cotizaciones.controller";
import {
  addAdminQuoteCartLine,
  clearAdminQuoteCart,
  getAdminQuoteCart,
  removeAdminQuoteCartLine,
  replaceAdminQuoteCart,
  updateAdminQuoteCartQuantity,
} from "../../controllers/cotizaciones/adminQuoteCart.controller";
import {
  MiddleAdminRoute,
  MiddleAuthRoute,
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

router.post("/", MiddleAuthRoute, uploadQuotePdf, createQuote);
router.get(
  "/admin/products/search",
  MiddleAuthRoute,
  MiddleAdminRoute,
  searchAdminQuoteProducts,
);
router.get(
  "/admin/products/availability",
  MiddleAuthRoute,
  MiddleAdminRoute,
  getAdminQuoteProductAvailability,
);
router.get(
  "/admin/import/:quoteNumber",
  MiddleAuthRoute,
  MiddleAdminRoute,
  getAdminQuoteImport,
);
router.post(
  "/admin/import/:quoteNumber",
  MiddleAuthRoute,
  MiddleAdminRoute,
  markAdminQuoteImported,
);
router.get("/admin/cart", MiddleAuthRoute, MiddleAdminRoute, getAdminQuoteCart);
router.post(
  "/admin/cart/replace",
  MiddleAuthRoute,
  MiddleAdminRoute,
  replaceAdminQuoteCart,
);
router.post(
  "/admin/cart/lines",
  MiddleAuthRoute,
  MiddleAdminRoute,
  addAdminQuoteCartLine,
);
router.post(
  "/admin/cart/lines/quantity",
  MiddleAuthRoute,
  MiddleAdminRoute,
  updateAdminQuoteCartQuantity,
);
router.delete(
  "/admin/cart/lines/:idProduct",
  MiddleAuthRoute,
  MiddleAdminRoute,
  removeAdminQuoteCartLine,
);
router.delete("/admin/cart", MiddleAuthRoute, MiddleAdminRoute, clearAdminQuoteCart);
router.post(
  "/admin",
  MiddleAuthRoute,
  MiddleAdminRoute,
  uploadQuotePdf,
  createAdminQuote,
);
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
  archiveAdminQuote,
);

export default router;
