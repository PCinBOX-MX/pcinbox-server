import { Router } from "express";
import {
  registerAddress,
  hasAddressUser,
  removeAddress,
  updatedAddress,
} from "./../../controllers/address/address.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const router = Router();

router.get("/hasAddressUser", MiddleAuthRoute, hasAddressUser);
router.post("/registerAddress", MiddleAuthRoute, registerAddress);
router.post("/removeAddress", MiddleAuthRoute, removeAddress);
router.post("/updatedAddress", MiddleAuthRoute, updatedAddress);

export default router;
