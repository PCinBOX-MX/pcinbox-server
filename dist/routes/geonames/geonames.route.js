"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const geonames_controller_1 = require("./../../controllers/geonames/geonames.controller");
const index_middleware_1 = require("./../../middleware/index.middleware");
const route = (0, express_1.Router)();
route.post("/getAddressWithPostalCode", index_middleware_1.MiddleAuthRoute, geonames_controller_1.getAddressWithPostalCode);
exports.default = route;
//# sourceMappingURL=geonames.route.js.map