import User from "../../models/User.js";
import OTP from "../../models/Otp.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { StatusCodes } from "http-status-codes";
import { BadRequestError, NotFoundError } from "../../errors/index.js";
import { generateOtp, mailSender } from "../../services/mailSender.js";

/**
 * 1. Send OTP to user email for Password Reset (Forgot Password)
 * POST /auth/forgot-password
 * Body: { email }
 */
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new BadRequestError("Please provide an email address.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new NotFoundError("No account found with this email address.");
  }

  // Delete any existing unused password reset OTPs for this email
  await OTP.deleteMany({ email: cleanEmail, otp_type: "reset_password" });

  const otp = generateOtp();
  await OTP.create({
    email: cleanEmail,
    otp,
    otp_type: "reset_password",
  });

  // Attempt to send email if SMTP is configured
  let emailSent = false;
  try {
    if (process.env.MAIL_USER && process.env.MAIL_PASS) {
      await mailSender(cleanEmail, otp, "reset_password");
      emailSent = true;
    }
  } catch (mailErr) {
    console.warn("[ForgotPassword] SMTP sending failed (using dev fallback):", mailErr.message);
  }

  console.log(`[PASSWORD RESET OTP] Generated OTP for ${cleanEmail}: ${otp}`);

  res.status(StatusCodes.OK).json({
    success: true,
    msg: emailSent
      ? "Password reset code sent to your email."
      : "Password reset code generated.",
    otp, // Included for development/testing support
  });
};

/**
 * 2. Verify OTP and Reset Account Password
 * POST /auth/reset-password
 * Body: { email, otp, new_password }
 */
export const resetPassword = async (req, res) => {
  const { email, otp, new_password } = req.body;

  if (!email || !otp || !new_password) {
    throw new BadRequestError("Please provide email, OTP verification code, and new password.");
  }

  if (new_password.length < 8) {
    throw new BadRequestError("Password must be at least 8 characters long.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new NotFoundError("No account found with this email address.");
  }

  // Find latest active OTP record
  const otpRecord = await OTP.findOne({
    email: cleanEmail,
    otp_type: "reset_password",
  })
    .sort({ createdAt: -1 })
    .limit(1);

  if (!otpRecord) {
    throw new BadRequestError("Invalid or expired OTP verification code.");
  }

  const isVerified = await otpRecord.compareOTP(otp.trim());
  if (!isVerified) {
    throw new BadRequestError("Invalid OTP verification code.");
  }

  // Delete used OTP record
  await OTP.deleteMany({ email: cleanEmail, otp_type: "reset_password" });

  // Update password and reset lockout attempts
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(new_password, salt);

  await User.findOneAndUpdate(
    { email: cleanEmail },
    {
      password: hashedPassword,
      wrong_password_attempts: 0,
      blocked_until_password: null,
    },
    { new: true }
  );

  console.log(`[PASSWORD RESET] Successfully reset password for ${cleanEmail}`);

  res.status(StatusCodes.OK).json({
    success: true,
    msg: "Password updated successfully. You can now sign in with your new password.",
  });
};

/**
 * 3. Send OTP to user email for MPIN Reset
 * POST /auth/forgot-pin
 * Body: { email }
 */
export const forgotPin = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new BadRequestError("Please provide an email address.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new NotFoundError("No account found with this email address.");
  }

  // Delete any existing unused PIN reset OTPs for this email
  await OTP.deleteMany({ email: cleanEmail, otp_type: "reset_pin" });

  const otp = generateOtp();
  await OTP.create({
    email: cleanEmail,
    otp,
    otp_type: "reset_pin",
  });

  // Attempt to send email if SMTP is configured
  let emailSent = false;
  try {
    if (process.env.MAIL_USER && process.env.MAIL_PASS) {
      await mailSender(cleanEmail, otp, "reset_pin");
      emailSent = true;
    }
  } catch (mailErr) {
    console.warn("[ForgotPin] SMTP sending failed (using dev fallback):", mailErr.message);
  }

  console.log(`[MPIN RESET OTP] Generated OTP for ${cleanEmail}: ${otp}`);

  res.status(StatusCodes.OK).json({
    success: true,
    msg: emailSent
      ? "MPIN reset code sent to your email."
      : "MPIN reset code generated.",
    otp, // Included for development/testing support
  });
};

/**
 * 4. Verify OTP and Reset MPIN (Only MPIN)
 * POST /auth/reset-pin
 * Body: { email, otp, new_pin }
 */
export const resetPin = async (req, res) => {
  const { email, otp, new_pin } = req.body;

  if (!email || !otp || !new_pin) {
    throw new BadRequestError("Please provide email, OTP verification code, and new 4-digit MPIN.");
  }

  const cleanPin = String(new_pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new BadRequestError("MPIN must be exactly 4 numeric digits.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new NotFoundError("No account found with this email address.");
  }

  // Find latest active OTP record
  const otpRecord = await OTP.findOne({
    email: cleanEmail,
    otp_type: "reset_pin",
  })
    .sort({ createdAt: -1 })
    .limit(1);

  if (!otpRecord) {
    throw new BadRequestError("Invalid or expired OTP verification code.");
  }

  const isVerified = await otpRecord.compareOTP(otp.trim());
  if (!isVerified) {
    throw new BadRequestError("Invalid OTP verification code.");
  }

  // Delete used OTP record
  await OTP.deleteMany({ email: cleanEmail, otp_type: "reset_pin" });

  // Update MPIN and reset lockout attempts
  const salt = await bcrypt.genSalt(10);
  const hashedPin = await bcrypt.hash(cleanPin, salt);

  await User.findOneAndUpdate(
    { email: cleanEmail },
    {
      login_pin: hashedPin,
      wrong_pin_attempts: 0,
      blocked_until_pin: null,
    },
    { new: true }
  );

  // Generate fresh socket authorization tokens for trading
  const socket_access_token = jwt.sign(
    { userId: user._id },
    process.env.SOCKET_TOKEN_SECRET,
    {
      expiresIn: process.env.SECRET_TOKEN_EXPIRY || process.env.SOCKET_TOKEN_EXPIRY || "1d",
    }
  );

  const socket_refresh_token = jwt.sign(
    { userId: user._id },
    process.env.REFRESH_SOCKET_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_SOCKET_TOKEN_EXPIRY || "30d",
    }
  );

  console.log(`[MPIN RESET] Successfully reset MPIN for ${cleanEmail}`);

  res.status(StatusCodes.OK).json({
    success: true,
    msg: "MPIN updated successfully. You can now unlock your portfolio with your new 4-digit MPIN.",
    socket_tokens: {
      socket_access_token,
      socket_refresh_token,
    },
  });
};
