"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const address_controller_1 = require("./../../controllers/address/address.controller");
const index_middleware_1 = require("./../../middleware/index.middleware");
const router = (0, express_1.Router)();
router.get("/hasAddressUser", index_middleware_1.MiddleAuthRoute, address_controller_1.hasAddressUser);
router.get("/listAddresses", index_middleware_1.MiddleAuthRoute, address_controller_1.listAddresses);
router.post("/registerAddress", index_middleware_1.MiddleAuthRoute, address_controller_1.registerAddress);
router.post("/removeAddress", index_middleware_1.MiddleAuthRoute, address_controller_1.removeAddress);
router.post("/updatedAddress", index_middleware_1.MiddleAuthRoute, address_controller_1.updatedAddress);
exports.default = router;
//# sourceMappingURL=address.route.js.map