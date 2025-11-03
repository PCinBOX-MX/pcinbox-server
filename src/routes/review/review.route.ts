import { Router } from "express";
import { MiddleAuthRoute } from "./../../middleware/index.middleware";
import { addReview } from "./../../controllers/review/review.controller";

const router = Router();

router.post("/addReview", MiddleAuthRoute, addReview);

export default router;
