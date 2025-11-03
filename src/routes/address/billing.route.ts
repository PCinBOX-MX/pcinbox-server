import { Router } from "express";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";
import {
  createBilling,
  getBillingByUser,
} from "./../../controllers/address/billing.controller";

const router = Router();

router.post("/createBilling", MiddleAuthRoute, createBilling);
router.get("/getBillingByUser", MiddleAuthRoute, getBillingByUser);

export default router;
