import { Router } from "express";
import {
  Login,
  Register,
  ResendRegisterCode,
  ConfirmRegister,
  uploadPhoto,
  deletePhoto,
  getPhotoUser,
  LoginGoogle,
  ChangePassword,
  removeAccount,
} from "../../controllers/users/user.controller";

import { MiddleAuthRoute } from "../../middleware/index.middleware";
import multer, { memoryStorage } from "multer";
const upload = multer({ storage: memoryStorage() });

const router = Router();

router.post("/login", Login);
router.post("/loginGoogle", LoginGoogle);
router.post("/register", Register);
router.post("/register/resend-code", ResendRegisterCode);
router.post("/register/confirm", ConfirmRegister);
router.post(
  "/uploadPhotoUser",
  MiddleAuthRoute,
  upload.single("file"),
  uploadPhoto
);
router.post("/changePassword", MiddleAuthRoute, ChangePassword);
router.delete("/deletePhotoUser", MiddleAuthRoute, deletePhoto);
router.get("/getPhotoUser", MiddleAuthRoute, getPhotoUser);
router.post("/removeAccount", MiddleAuthRoute, removeAccount);
export default router;
