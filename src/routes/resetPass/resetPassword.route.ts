import { Router } from "express";
import {
  forgotPassword,
  resFileLinkResetPass,
  changePassword,
} from "./../../controllers/resetpass/resetPassword.controller";

const router = Router();

router.post("/forgotPassword", forgotPassword);
router.get("/resFileLinkResetPass", resFileLinkResetPass);
router.post("/changePassword", changePassword);

export default router;
