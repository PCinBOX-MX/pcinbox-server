"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const resetPassword_controller_1 = require("./../../controllers/resetpass/resetPassword.controller");
const router = (0, express_1.Router)();
router.post("/forgotPassword", resetPassword_controller_1.forgotPassword);
router.get("/resFileLinkResetPass", resetPassword_controller_1.resFileLinkResetPass);
router.post("/changePassword", resetPassword_controller_1.changePassword);
exports.default = router;
//# sourceMappingURL=resetPassword.route.js.map