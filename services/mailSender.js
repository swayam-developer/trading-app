import otpGenerator from "otp-generator";
import nodemailer from "nodemailer";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import inlineCss from "inline-css";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const mailSender = async (email, otp, otp_type) => {
  const templatePath = path.join(__dirname, "../otp_template.html");
  let htmlContent = fs.readFileSync(templatePath, "utf-8");
  htmlContent = htmlContent.replaceAll("tradevault_otp2", otp);
  htmlContent = htmlContent.replaceAll("tradevault_otp", otp);
  htmlContent = htmlContent.replaceAll("TradingApp_otp2", otp);
  htmlContent = htmlContent.replaceAll("TradingApp_otp", otp);

  const options = {
    url: " ",
  };
  htmlContent = await inlineCss(htmlContent, options);

  try {
    let transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS ? process.env.MAIL_PASS.replace(/\s+/g, "") : "",
      },
    });
    let result = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Trading App - OTP Verification",
      html: htmlContent,
    });
    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const generateOTP = () => {
  const otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });
  return otp;
};

export const generateOtp = generateOTP;
