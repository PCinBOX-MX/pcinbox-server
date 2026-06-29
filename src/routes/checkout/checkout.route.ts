import { Router } from "express";
import { MiddleAuthRoute } from "../../middleware/index.middleware";
import {
  buildPaymentPayload,
  calculateGroupQuote,
  calculateInsurance,
  calculateVolumetric,
  calculateZoneShipping,
  clearCheckoutDraft,
  getCheckoutDraft,
  getCheckoutSummary,
  saveCheckoutDraft,
} from "../../controllers/checkout/checkout.controller";

const router = Router();

router.post("/saveDraft", MiddleAuthRoute, saveCheckoutDraft);
router.get("/getDraft", MiddleAuthRoute, getCheckoutDraft);
router.delete("/clearDraft", MiddleAuthRoute, clearCheckoutDraft);
router.post("/calculateInsurance", MiddleAuthRoute, calculateInsurance);
router.post("/calculateVolumetric", MiddleAuthRoute, calculateVolumetric);
router.post("/calculateZoneShipping", MiddleAuthRoute, calculateZoneShipping);
router.post("/calculateGroupQuote", MiddleAuthRoute, calculateGroupQuote);
router.post("/summary", MiddleAuthRoute, getCheckoutSummary);
router.post("/buildPayment", MiddleAuthRoute, buildPaymentPayload);

export default router;
