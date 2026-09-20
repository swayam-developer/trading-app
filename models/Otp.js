import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { mailSender } from "../services/mailSender.js";

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 5,
  },
  otp_type: {
    type: String,
    enum: ["phone", "email", "reset_password", "reset_pin"],
    required: true,
  },
});
otpSchema.pre("save", async function () {
  if (this.isNew) {
    const salt = await bcrypt.genSalt(10);
    // SMTP commented out: show OTP directly in app for dev/testing
    // await sendVerificationMail(this.email, this.otp, this.otp_type);
    console.log(`[TEST OTP] Generated OTP for ${this.email} (${this.otp_type}): ${this.otp}`);
    this.otp = await bcrypt.hash(this.otp, salt);
  }
});

otpSchema.methods.compareOTP = async function (enteredOtp) {
  return await bcrypt.compare(enteredOtp, this.otp);
};

async function sendVerificationMail(email, otp, otp_type) {
  try {
    const mailResponse = await mailSender(email, otp, otp_type);
  } catch (error) {
    console.log(error);
    throw error;
  }
}

const OTP = mongoose.model("OTP", otpSchema);
export default OTP;
