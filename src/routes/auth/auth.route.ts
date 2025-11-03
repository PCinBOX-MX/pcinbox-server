import { Router } from "express";
import { getAuth } from "./../../controllers/auth/auth.controller";

const router = Router();

router.get("/getAuth", getAuth);

export default router;
