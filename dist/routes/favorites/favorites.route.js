"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const favorites_controller_1 = require("./../../controllers/favorites/favorites.controller");
const index_middleware_1 = require("./../../middleware/index.middleware");
const router = (0, express_1.Router)();
router.get("/getFavoritesUser", index_middleware_1.MiddleAuthRoute, favorites_controller_1.getFavoritosUser);
router.post("/addFavorites", index_middleware_1.MiddleAuthRoute, favorites_controller_1.addFavorites);
router.post("/removeFavorites", index_middleware_1.MiddleAuthRoute, favorites_controller_1.removeFavorites);
exports.default = router;
//# sourceMappingURL=favorites.route.js.map