"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_middleware_1 = require("../../middleware/index.middleware");
const checkout_controller_1 = require("../../controllers/checkout/checkout.controller");
const router = (0, express_1.Router)();
router.post("/saveDraft", index_middleware_1.MiddleAuthRoute, checkout_controller_1.saveCheckoutDraft);
router.get("/getDraft", index_middleware_1.MiddleAuthRoute, checkout_controller_1.getCheckoutDraft);
router.delete("/clearDraft", index_middleware_1.MiddleAuthRoute, checkout_controller_1.clearCheckoutDraft);
router.post("/calculateInsurance", index_middleware_1.MiddleAuthRoute, checkout_controller_1.calculateInsurance);
router.post("/calculateVolumetric", index_middleware_1.MiddleAuthRoute, checkout_controller_1.calculateVolumetric);
router.post("/calculateZoneShipping", index_middleware_1.MiddleAuthRoute, checkout_controller_1.calculateZoneShipping);
router.post("/calculateGroupQuote", index_middleware_1.MiddleAuthRoute, checkout_controller_1.calculateGroupQuote);
router.post("/summary", index_middleware_1.MiddleAuthRoute, checkout_controller_1.getCheckoutSummary);
router.post("/buildPayment", index_middleware_1.MiddleAuthRoute, checkout_controller_1.buildPaymentPayload);
exports.default = router;
//# sourceMappingURL=checkout.route.js.map