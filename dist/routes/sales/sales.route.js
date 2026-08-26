"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_controller_1 = require("./../../controllers/sales/sales.controller");
const index_middleware_1 = require("./../../middleware/index.middleware");
const router = (0, express_1.Router)();
router.get("/getPedidosByUser", index_middleware_1.MiddleAuthRoute, sales_controller_1.getPedidosByUser);
router.get("/historySalesByUser", index_middleware_1.MiddleAuthRoute, sales_controller_1.historySalesByUser);
router.post("/getSalesByUser", index_middleware_1.MiddleAuthRoute, sales_controller_1.getSalesByUser);
router.post("/registerSales", index_middleware_1.MiddleAuthRoute, sales_controller_1.registerSales);
router.post("/filterSales", index_middleware_1.MiddleAuthRoute, sales_controller_1.filterSales);
router.post("/cancelOrder", index_middleware_1.MiddleAuthRoute, sales_controller_1.cancelOrderByUser);
router.post("/admin/sendLicenseKey", index_middleware_1.MiddleAuthRoute, sales_controller_1.sendLicenseKeyEmailAdmin);
exports.default = router;
//# sourceMappingURL=sales.route.js.map