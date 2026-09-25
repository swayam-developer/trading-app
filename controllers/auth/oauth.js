import User from "../../models/User.js";
import { StatusCodes } from "http-status-codes";
import { BadRequestError, UnauthenticatedError } from "../../errors/index.js";
import { OAuth2Client } from "google-auth-library";
import { sendLoginNotification } from "../../services/fcmService.js";

const googleClient = new OAuth2Client();

const signInWithOauth = async (req, res) => {
  const { id_token, provider, fcmToken } = req.body;
  if (!id_token || provider !== "google") {
    throw new BadRequestError("Invalid request. Provider must be 'google'.");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const audiences = [
      clientId,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean);

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: audiences.length > 0 ? audiences : undefined,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthenticatedError("Invalid Google ID token payload");
    }

    const email = payload.email;
    const updateData = {};

    if (payload.name) {
      updateData.name = payload.name.trim().slice(0, 50);
    }

    if (fcmToken) {
      updateData.fcmToken = fcmToken;
    }

    const user = await User.findOneAndUpdate(
      { email },
      updateData,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const accessToken = user.createAccessToken();
    const refreshToken = user.createRefreshToken();

    if (fcmToken || user.fcmToken) {
      sendLoginNotification(fcmToken || user.fcmToken, user.name || user.email).catch(
        (err) => console.error("[FCM OAuth Error]", err.message)
      );
    }

    let phone_exist = false;
    let login_pin_exist = false;

    if (user.phone_number || user.phone) phone_exist = true;
    if (user.login_pin) login_pin_exist = true;

    res.status(StatusCodes.OK).json({
      user: {
        email: user.email,
        name: user.name,
        userId: user._id || user.id,
        phone_exist,
        login_pin_exist,
      },
      tokens: { access_token: accessToken, refresh_token: refreshToken },
    });
  } catch (error) {
    console.error("[Google OAuth Error]:", error?.message || error);
    if (error instanceof BadRequestError || error instanceof UnauthenticatedError) {
      throw error;
    }
    throw new UnauthenticatedError("Invalid Google Oauth token");
  }
};

export { signInWithOauth };