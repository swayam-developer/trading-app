import User from "../../models/User.js";
import { StatusCodes } from "http-status-codes";
import {
  BadRequestError,
  NotFoundError,
  UnauthenticatedError,
} from "../../errors/index.js";
import jwt from "jsonwebtoken";
import {
  sendWelcomeNotification,
  sendLoginNotification,
} from "../../services/fcmService.js";

const register = async (req, res) => {
  const { email, password, register_token, fcmToken } = req.body;
  if (!email || !password || !register_token) {
    throw new BadRequestError("Please provide all values");
  }
  const user = await User.findOne({ email });
  if (user) {
    throw new BadRequestError("user already exists");
  }
  try {
    const payload = jwt.verify(register_token, process.env.REGISTER_SECRET);
    if (payload.email != email) {
      throw new BadRequestError("Invalid register token");
    }
    const newUser = await User.create({
      email,
      password,
      fcmToken: fcmToken || null,
    });
    const access_token = newUser.createAccessToken();
    const refresh_token = newUser.createRefreshToken();

    // Trigger welcome push notification in background
    if (fcmToken) {
      sendWelcomeNotification(fcmToken, newUser.name || newUser.email).catch(
        (err) => console.error("[FCM Register Error]", err.message)
      );
    }

    res.status(StatusCodes.CREATED).json({
      user: { email: newUser.email, userId: newUser._id },
      tokens: { access_token, refresh_token },
    });
  } catch (err) {
    console.log(err);
    if (err.statusCode) {
      throw err;
    }
    throw new BadRequestError(err.message || "Invalid body or token");
  }
};

const login = async (req, res) => {
  const { email, password, fcmToken } = req.body;
  if (!email || !password) {
    throw new BadRequestError("Please Provide all Values");
  }
  const user = await User.findOne({ email });

  if (!user) {
    throw new UnauthenticatedError("Invalid credentials");
  }
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    let message;

    if (
      user.blocked_until_password &&
      user.blocked_until_password > new Date()
    ) {
      const remainingMinutes = Math.ceil(
        (user.blocked_until_password - new Date()) / (60 * 1000),
      );
      message = `Your account is blocked for password. please try again after ${remainingMinutes} minutes(s). `;
    } else {
      const attemptsRemaining = 3 - user.wrong_password_attempts;
      message =
        attemptsRemaining > 0
          ? `Invalid Password, ${attemptsRemaining} attempts remaining`
          : "Invalid login attempts exceeded. Please try after 30 minutes.";
    }
    throw new UnauthenticatedError(message);
  }

  // Update user FCM token if provided
  if (fcmToken && user.fcmToken !== fcmToken) {
    user.fcmToken = fcmToken;
    await user.save();
  }

  // Trigger login security alert push notification
  const tokenToNotify = fcmToken || user.fcmToken;
  if (tokenToNotify) {
    sendLoginNotification(tokenToNotify, user.name || user.email).catch(
      (err) => console.error("[FCM Login Error]", err.message)
    );
  }

  const access_token = user.createAccessToken();
  const refresh_token = user.createRefreshToken();

  let phone_exist = false;
  let login_pin_exist = false;

  if (user.phone_number) {
    phone_exist = true;
  }
  if (user.login_pin) {
    login_pin_exist = true;
  }

  res.status(StatusCodes.OK).json({
    user: {
      name: user.name,
      email: user.email,
      userId: user._id,
      phone_exist,
      login_pin_exist,
    },
    tokens: { access_token, refresh_token },
    token: { access_token, refresh_token },
  });
};

const refreshToken = async (req, res) => {
  const { type, refresh_token } = req.body;
  if (!type || !["socket", "app"].includes(type) || !refresh_token) {
    throw new BadRequestError("invalid body");
  }
  try {
    let accessToken, newRefreshToken;
    if (type === "app") {
      ({ access_token: accessToken, newRefreshToken } =
        await generateRefreshTokens(
          refresh_token,
          process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_SECRET,
          process.env.REFRESH_TOKEN_EXPIRY || process.env.REFRESH_SECRET_EXPIRY,
          process.env.JWT_SECRET || process.env.ACCESS_SECRET,
          process.env.ACCESS_TOKEN_EXPIRY || process.env.ACCESS_SECRET_EXPIRY,
        ));
    } else if (type === "socket") {
      ({ access_token: accessToken, newRefreshToken } =
        await generateRefreshTokens(
          refresh_token,
          process.env.REFRESH_SOCKET_TOKEN_SECRET,
          process.env.REFRESH_SOCKET_TOKEN_EXPIRY,
          process.env.SOCKET_TOKEN_SECRET,
          process.env.SOCKET_TOKEN_EXPIRY,
        ));
    }
    res
      .status(StatusCodes.OK)
      .json({ access_token: accessToken, refresh_token: newRefreshToken });
  } catch (error) {
    console.error(error);
    throw new UnauthenticatedError("Invalid Token");
  }
};

async function generateRefreshTokens(
  token,
  refresh_secret,
  refresh_expiry,
  access_secret,
  access_expiry,
) {
  try {
    console.log("Refresh secret exists:", !!refresh_secret);
    console.log("Refresh expiry:", refresh_expiry);
    console.log("Access secret exists:", !!access_secret);
    console.log("Access expiry:", access_expiry);

    const payload = jwt.verify(token, refresh_secret);

    console.log("JWT payload:", payload);

    const user = await User.findById(payload.userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const access_token = jwt.sign({ userId: payload.userId }, access_secret, {
      expiresIn: access_expiry,
    });

    const newRefresh_token = jwt.sign(
      { userId: payload.userId },
      refresh_secret,
      {
        expiresIn: refresh_expiry,
      },
    );

    return {
      access_token,
      newRefreshToken: newRefresh_token,
    };
  } catch (error) {
    console.error("REFRESH TOKEN ERROR:", error);
    throw new UnauthenticatedError("Invalid Token");
  }
}

const logout = async (req, res) => {
  const accessToken = req.headers.authorization.split(" ")[1];
  const decodedToken = jwt.decode(accessToken, process.env.JWT_SECRET);
  const userId = decodedToken.userId;
  await User.updateOne({ _id: userId }, { $unset: { biometricKey: 1 } });

  res.status(StatusCodes.OK).json({ message: "Logged out successfully" });
};

export { register, login, refreshToken, logout };
