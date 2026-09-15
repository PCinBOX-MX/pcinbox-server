import { Router } from "express";
import {
  MiddleAuthRoute,
  MiddlePosRoute,
} from "../../middleware/index.middleware";
import {
  addPosCashMovement,
  cancelPosSale,
  closePosCash,
  completePosByOpenPayLink,
  confirmPosPayment,
  createPosSale,
  getPosCashSessionById,
  getPosCashStatus,
  getPosQuoteByNumber,
  getPosSaleById,
  getPosSaleTicket,
  getPosSaleWarrantySheet,
  getPosSerial,
  listInventoryMovements,
  listPosBranches,
  listPosCashSessionMovements,
  listPosCashSessions,
  listPosSales,
  markPosSerialRma,
  openPosCash,
  registerPosSerial,
  retryPosPaymentLink,
  searchPosCustomers,
  searchPosProductsHandler,
  searchPosSerials,
  updatePosProductSerialConfig,
} from "../../controllers/pos/pos.controller";

const router = Router();

// Sin auth de usuario: secreto compartido con la pasarela
router.post("/internal/completeByOpenPayLink", completePosByOpenPayLink);

router.use(MiddleAuthRoute, MiddlePosRoute);

router.get("/branches", listPosBranches);
router.get("/products/search", searchPosProductsHandler);
router.get("/quotes/:quoteNumber", getPosQuoteByNumber);
router.post("/products/:productId/serial-config", updatePosProductSerialConfig);
router.get("/customers/search", searchPosCustomers);
router.post("/sales", createPosSale);
router.get("/sales", listPosSales);
router.get("/sales/:id", getPosSaleById);
router.get("/sales/:id/ticket", getPosSaleTicket);
router.get("/sales/:id/warranty", getPosSaleWarrantySheet);
router.post("/sales/:id/cancel", cancelPosSale);
router.post("/sales/:id/confirmPayment", confirmPosPayment);
router.post("/sales/:id/retryPaymentLink", retryPosPaymentLink);

router.get("/cash/status", getPosCashStatus);
router.post("/cash/open", openPosCash);
router.post("/cash/movements", addPosCashMovement);
router.post("/cash/close", closePosCash);
router.get("/cash/sessions", listPosCashSessions);
router.get("/cash/sessions/:id/movements", listPosCashSessionMovements);
router.get("/cash/sessions/:id", getPosCashSessionById);

router.get("/inventory/movements", listInventoryMovements);

router.get("/serials/search", searchPosSerials);
router.get("/serials/:serial", getPosSerial);
router.post("/serials", registerPosSerial);
router.post("/serials/rma", markPosSerialRma);

export default router;
