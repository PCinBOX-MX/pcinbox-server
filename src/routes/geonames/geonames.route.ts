import { Router } from "express";
import { getAddressWithPostalCode } from "./../../controllers/geonames/geonames.controller";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";

const route = Router();

route.post(
  "/getAddressWithPostalCode",
  MiddleAuthRoute,
  getAddressWithPostalCode
);

export default route;
