"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_middleware_1 = require("./../../middleware/index.middleware");
const review_controller_1 = require("./../../controllers/review/review.controller");
const router = (0, express_1.Router)();
router.post("/addReview", index_middleware_1.MiddleAuthRoute, review_controller_1.addReview);
exports.default = router;
//# sourceMappingURL=review.route.js.map