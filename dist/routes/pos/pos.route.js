"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_middleware_1 = require("../../middleware/index.middleware");
const pos_controller_1 = require("../../controllers/pos/pos.controller");
const router = (0, express_1.Router)();
router.use(index_middleware_1.MiddleAuthRoute, index_middleware_1.MiddleAdminRoute);
router.get("/branches", pos_controller_1.listPosBranches);
router.get("/products/search", pos_controller_1.searchPosProductsHandler);
router.get("/customers/search", pos_controller_1.searchPosCustomers);
router.post("/sales", pos_controller_1.createPosSale);
router.get("/sales", pos_controller_1.listPosSales);
router.get("/sales/:id", pos_controller_1.getPosSaleById);
router.get("/sales/:id/ticket", pos_controller_1.getPosSaleTicket);
router.post("/sales/:id/cancel", pos_controller_1.cancelPosSale);
router.post("/sales/:id/confirmPayment", pos_controller_1.confirmPosPayment);
router.post("/sales/:id/retryPaymentLink", pos_controller_1.retryPosPaymentLink);
exports.default = router;
//# sourceMappingURL=pos.route.js.map