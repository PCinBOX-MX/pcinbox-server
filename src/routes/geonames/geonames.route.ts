import { Router } from "express";
import {
  getAddressWithPostalCode,
  ShippingByZone,
} from "./../../controllers/geonames/geonames.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const route = Router();

route.post(
  "/getAddressWithPostalCode",
  MiddleAuthRoute,
  getAddressWithPostalCode
);

route.post("/ShippingByZone", MiddleAuthRoute, ShippingByZone);

export default route;
