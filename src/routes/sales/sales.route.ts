import { Router } from "express";
import {
  registerSales,
  getPedidosByUser,
  getSalesByUser,
  historySalesByUser,
  filterSales,
} from "./../../controllers/sales/sales.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const router = Router();

router.get("/getPedidosByUser", MiddleAuthRoute, getPedidosByUser);
router.get("/historySalesByUser", MiddleAuthRoute, historySalesByUser);
router.post("/getSalesByUser", MiddleAuthRoute, getSalesByUser);
router.post("/registerSales", MiddleAuthRoute, registerSales);
router.post("/filterSales", MiddleAuthRoute, filterSales);

export default router;
