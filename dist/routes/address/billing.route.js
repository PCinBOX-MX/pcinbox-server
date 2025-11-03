"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_middleware_1 = require("./../../middleware/index.middleware");
const billing_controller_1 = require("./../../controllers/address/billing.controller");
const router = (0, express_1.Router)();
router.post("/createBilling", index_middleware_1.MiddleAuthRoute, billing_controller_1.createBilling);
router.get("/getBillingByUser", index_middleware_1.MiddleAuthRoute, billing_controller_1.getBillingByUser);
exports.default = router;
//# sourceMappingURL=billing.route.js.map