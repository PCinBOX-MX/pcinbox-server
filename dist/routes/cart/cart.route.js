"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cart_controller_1 = require("./../../controllers/cart/cart.controller");
const index_middleware_1 = require("./../../middleware/index.middleware");
const router = (0, express_1.Router)();
router.get("/getCart", index_middleware_1.MiddleAuthRoute, cart_controller_1.getCart);
router.post("/addProduct", index_middleware_1.MiddleAuthRoute, cart_controller_1.addProduct);
router.post("/removeProduct", index_middleware_1.MiddleAuthRoute, cart_controller_1.removeProduct);
router.post("/addProductFromStorage", index_middleware_1.MiddleAuthRoute, cart_controller_1.addProductFromStorage);
router.post("/removeAllCart", index_middleware_1.MiddleAuthRoute, cart_controller_1.removeAllCart);
router.post("/generateCotizacion", index_middleware_1.MiddleAuthRoute, cart_controller_1.generateCotizacion);
router.post("/changeSucursal", index_middleware_1.MiddleAuthRoute, cart_controller_1.changeSucursal);
exports.default = router;
//# sourceMappingURL=cart.route.js.map