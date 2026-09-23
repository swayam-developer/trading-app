import User from "../../models/User.js";
import { StatusCodes } from "http-status-codes";
import { BadRequestError, UnauthenticatedError } from "../../errors/index.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { sendLoginNotification } from "../../services/fcmService.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const jwksClientInstance = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  timeout: 3000,
});

async function getKey(kid) {
  return new Promise((resolve, reject) => {
    jwksClientInstance.getSigningKey(kid, (err, key) => {
      if (err) {
        return reject(err);
      }
      const signingKey = key.getPublicKey();
      resolve(signingKey);
    });
  });
}

const signInWithOauth = async (req, res) => {
  const { id_token, provider, fcmToken } = req.body;
  if (!id_token || !provider || !["google", "apple"].includes(provider)) {
    throw new BadRequestError("Invalid request");
  }

  try {
    let email, user;

    if (provider === "apple") {
      const { header } = jwt.decode(id_token, { complete: true });
      const kid = header.kid;
      const publicKey = await getKey(kid);
      ({ email } = jwt.verify(id_token, publicKey));
    }
    if (provider === "google") {
      const ticket = await googleClient.verifyToken({
        idToken: id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload.email;
    }
    const updateData = { email_verified: true };
    if (fcmToken) {
      updateData.fcmToken = fcmToken;
    }

    user = await User.findOneAndUpdate(
      { email },
      updateData,
      { new: true, upsert: true },
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
    throw new UnauthenticatedError("Invalid Oauth token");
  }
};

export { signInWithOauth };