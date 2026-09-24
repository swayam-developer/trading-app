import jwt from "jsonwebtoken";
import UnauthenticatedError from "../errors/unauthenticated.js";
import User from "../models/User.js";
import NotFoundError from "../errors/not-found.js";

const authenticateSocketUser = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.access_token ||
      socket.handshake.headers?.access_token ||
      socket.handshake.auth?.token;
    if (!token) {
      throw new UnauthenticatedError("Authentication Invalid");
    }

    const decoded = jwt.verify(token, process.env.SOCKET_TOKEN_SECRET);
    if (!decoded) {
      throw new UnauthenticatedError("Invalid token");
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new NotFoundError("User not Found");
    }
    socket.user = user;
    next();
  } catch (error) {
    console.log("Socket Authentication Error:", error.message);
    next(new UnauthenticatedError("Authentication Error"));
  }
};
export default authenticateSocketUser;
