import express from "express";
import {
  refreshToken,
  login,
  logout,
  register,
} from "../controllers/auth/auth.js";

import { checkEmail } from "../controllers/auth/email.js";
import { signInWithOauth } from "../controllers/auth/oauth.js";
import { verifyOtp, sendOtp } from "../controllers/auth/otp.js";
import {
  getProfile,
  setLoginPinFirst,
  updateProfile,
  verifyPin,
  updateFcmToken,
} from "../controllers/auth/user.js";
import {
  forgotPassword,
  resetPassword,
  forgotPin,
  resetPin,
} from "../controllers/auth/passwordReset.js";
import authenticateUser from "../middleware/authentication.js";
import {
  uploadBiometrics,
  verifyBiometrics,
} from "../controllers/auth/biometric.js";

const router = express.Router();

router.post("/refresh-token", refreshToken);
router.post("/logout", authenticateUser, logout);
router.post("/register", register);
router.post("/login", login);
router.post("/check-email", checkEmail);
router.post("/oauth", signInWithOauth);
router.post("/verify-otp", verifyOtp);
router.post("/send-otp", sendOtp);
router.post("/fcm-token", authenticateUser, updateFcmToken);

// Dedicated Password Reset (Forgot Password) APIs
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Dedicated MPIN Reset APIs
router.post("/forgot-pin", forgotPin);
router.post("/reset-pin", resetPin);

router
  .route("/profile")
  .get(authenticateUser, getProfile)
  .put(authenticateUser, updateProfile);
router.post("/set-pin", authenticateUser, setLoginPinFirst);
router.post("/verify-pin", authenticateUser, verifyPin);
router.post("/upload-biometric", authenticateUser, uploadBiometrics);
router.post("/verify-biometric", authenticateUser, verifyBiometrics);

export default router;
