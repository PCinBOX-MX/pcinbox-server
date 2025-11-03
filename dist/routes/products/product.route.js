"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_controller_1 = require("./../../controllers/products/product.controller");
const router = (0, express_1.Router)();
router.get("/getProducts", product_controller_1.getProducts);
exports.default = router;
//# sourceMappingURL=product.route.js.map