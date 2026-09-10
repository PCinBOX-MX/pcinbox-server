import { Router } from "express";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";
import {
  createBilling,
  getBillingByUser,
  listBilling,
  removeBilling,
  updateBilling,
} from "./../../controllers/address/billing.controller";

const router = Router();

router.post("/createBilling", MiddleAuthRoute, createBilling);
router.post("/updateBilling", MiddleAuthRoute, updateBilling);
router.post("/removeBilling", MiddleAuthRoute, removeBilling);
router.get("/getBillingByUser", MiddleAuthRoute, getBillingByUser);
router.get("/listBilling", MiddleAuthRoute, listBilling);

export default router;
