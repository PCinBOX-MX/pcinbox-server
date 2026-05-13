import { Router } from "express";
import {
  addFavorites,
  getFavoritosUser,
  getTotalFavorites,
  removeFavorites,
} from "./../../controllers/favorites/favorites.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const router = Router();

router.get("/getFavoritesUser", MiddleAuthRoute, getFavoritosUser);
router.post("/addFavorites", MiddleAuthRoute, addFavorites);
router.post("/removeFavorites", MiddleAuthRoute, removeFavorites);
router.get("/getTotalFavorites", MiddleAuthRoute, getTotalFavorites);

export default router;
