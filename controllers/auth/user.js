import jwt from "jsonwebtoken";
import {
  BadRequestError,
  NotFoundError,
  UnauthenticatedError,
} from "../../errors/index.js";
import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { StatusCodes } from "http-status-codes";

const updateProfile = async (req, res) => { 
  const { name, gender, date_of_birth } = req.body;
  const accessToken = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = decoded.userId;

  const updatedFields = {};
  if (name) updatedFields.name = name;
  if (gender) updatedFields.gender = gender;
  if (date_of_birth) updatedFields.date_of_birth = date_of_birth;

  const updatedUser = await User.findByIdAndUpdate(userId, updatedFields, {
    new: true,
    runValidatores: true,
    select: "-password -biometricKey -login_pin",
  });
  if (!updatedUser) {
    throw new NotFoundError(`No user with id:${userId}`);
  }
  res.status(StatusCodes.OK).json({ success: true, data: updatedUser });
};

const setLoginPinFirst = async (req, res) => {
  const { login_pin } = req.body;

  if (!login_pin || login_pin.length !== 4) {
    throw new BadRequestError("Login pin must be 4 digits");
  }

  const accessToken = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = decoded.userId;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError(`No user with id:${userId}`);
  }

  if (user.login_pin) {
    throw new BadRequestError("Login pin already set");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPin = await bcrypt.hash(login_pin, salt);

  await User.findByIdAndUpdate(
    userId,
    { login_pin: hashedPin },
    { new: true, runValidators: true },
  );

  // Socket access token
  const access_token = jwt.sign(
    { userId },
    process.env.SOCKET_TOKEN_SECRET,
    {
      expiresIn: process.env.SECRET_TOKEN_EXPIRY || process.env.SOCKET_TOKEN_EXPIRY || "1d",
    }
  );

  const refresh_token = jwt.sign(
    { userId },
    process.env.REFRESH_SOCKET_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_SOCKET_TOKEN_EXPIRY || "30d",
    }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    socket_tokens: {
      socket_access_token: access_token,
      socket_refresh_token: refresh_token,
    },
  });
};

const verifyPin = async (req, res) => {
  const { login_pin } = req.body;

  if (!login_pin || login_pin.length !== 4) {
    throw new BadRequestError("Login pin must be 4 digits");
  }

  const accessToken = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = decoded.userId;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError(`No user with id:${userId}`);
  }

  if (!user.login_pin) {
    throw new BadRequestError("Login pin not set");
  }

  const isVerifyingPin = await user.comparePIN(login_pin);

  if (!isVerifyingPin) {
    let message;

    if (
      user.blocked_until_pin &&
      user.blocked_until_pin > new Date()
    ) {
      const blockedTime = Math.ceil(
        (user.blocked_until_pin - new Date()) / 60000,
      );

      message = `Please try again after ${blockedTime} minutes`;
    } else {
      const attemptsRemaining = 3 - user.wrong_pin_attempts;

      message =
        attemptsRemaining > 0
          ? `Wrong PIN. ${attemptsRemaining} attempts remaining.`
          : `You have been blocked due to multiple wrong attempts. Please try again after 30 min.`;
    }

    throw new UnauthenticatedError(message);
  }

  const access_token = jwt.sign(
    { userId },
    process.env.SOCKET_TOKEN_SECRET,
    {
      expiresIn: process.env.SECRET_TOKEN_EXPIRY || process.env.SOCKET_TOKEN_EXPIRY || "1d",
    }
  );

  const refresh_token = jwt.sign(
    { userId },
    process.env.REFRESH_SOCKET_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_SOCKET_TOKEN_EXPIRY || "30d",
    }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    socket_tokens: {
      socket_access_token: access_token,
      socket_refresh_token: refresh_token,
    },
  });
};

const getProfile = async (req, res) => {
  const accessToken = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = decoded.userId;

  const user = await User.findById(userId).select("-password");
  if (!user) {
    throw new NotFoundError(`No user with id:${userId}`);
  }

  const pinExists = !!user.login_pin;
  const phoneExists = !!user.phone_number;
  const biometricExists = !!user.biometricKey;

  res.status(StatusCodes.OK).json({
    userId: user.id,
    email: user.email,
    name: user.name || "",
    phone_exist: phoneExists,
    login_pin_exist: pinExists,
    biometric_exist: biometricExists,
    balance: (user.balance || 0).toFixed(2),
  });
};

export { updateProfile, setLoginPinFirst, verifyPin, getProfile };
