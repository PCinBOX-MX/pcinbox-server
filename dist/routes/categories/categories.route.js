"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categories_controller_1 = require("./../../controllers/categories/categories.controller");
const index_middleware_1 = require("../../middleware/index.middleware");
const router = (0, express_1.Router)();
router.get("/list", index_middleware_1.MiddleAuthRoute, categories_controller_1.getListCategories);
exports.default = router;
//# sourceMappingURL=categories.route.js.map