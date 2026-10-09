import { Router } from "express";
import {
  getCart,
  addProduct,
  removeProduct,
  addProductFromStorage,
  removeAllCart,
  generateCotizacion,
  changeSucursal,
  changeQuantity,
  importFromQuote,
} from "./../../controllers/cart/cart.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const router = Router();

router.get("/getCart", MiddleAuthRoute, getCart);
router.post("/addProduct", MiddleAuthRoute, addProduct);
router.post("/removeProduct", MiddleAuthRoute, removeProduct);
router.post("/addProductFromStorage", MiddleAuthRoute, addProductFromStorage);
router.post("/removeAllCart", MiddleAuthRoute, removeAllCart);
router.post("/generateCotizacion", MiddleAuthRoute, generateCotizacion);
router.post("/changeSucursal", MiddleAuthRoute, changeSucursal);
router.post("/changeQuantity", MiddleAuthRoute, changeQuantity);
router.post("/importFromQuote", MiddleAuthRoute, importFromQuote);

export default router;
