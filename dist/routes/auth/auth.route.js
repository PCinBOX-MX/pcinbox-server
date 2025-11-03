"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./../../controllers/auth/auth.controller");
const router = (0, express_1.Router)();
router.get("/getAuth", auth_controller_1.getAuth);
exports.default = router;
//# sourceMappingURL=auth.route.js.map