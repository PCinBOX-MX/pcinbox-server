import { Router } from "express";
import {
  addFavorites,
  getFavoritosUser,
  removeFavorites,
} from "./../../controllers/favorites/favorites.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const router = Router();

router.get("/getFavoritesUser", MiddleAuthRoute, getFavoritosUser);
router.post("/addFavorites", MiddleAuthRoute, addFavorites);
router.post("/removeFavorites", MiddleAuthRoute, removeFavorites);

export default router;
