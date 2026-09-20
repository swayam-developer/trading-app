import { StatusCodes } from "http-status-codes";
import  BadRequestError  from "../../errors/bad-request.js";
import Order from "../../models/Order.js";
import jwt from "jsonwebtoken";

const getOrder = async (req, res) => {
  let userId = req.user?.userId;
  if (!userId && req.headers.authorization) {
    const accessToken = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(accessToken, process.env.SOCKET_TOKEN_SECRET);
    userId = decoded.userId;
  }

  try {
    const orders = await Order.find({ user: userId })
      .sort({ timestamp: -1, createdAt: -1 })
      .populate({ path: "user", select: "-password -biometricKey -login_pin" })
      .populate({
        path: "stock",
        select: "symbol companyName iconUrl lastDayTradedPrice currentPrice",
      });
    res.status(StatusCodes.OK).json({
      msg: "Orders retrieved SuccessFully!",
      data: orders,
    });
  } catch (error) {
    throw new BadRequestError("Failed to retreive orders. " + error.message);
  }
};

export { getOrder };
