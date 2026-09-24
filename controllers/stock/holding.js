import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import BadRequestError from "../../errors/bad-request.js";
import Stock from "../../models/Stock.js";
import User from "../../models/User.js";
import Holding from "../../models/Holding.js";
import Order from "../../models/Order.js";
import { calculateMarketStatus } from "./stock.js";

const buyStock = async (req, res) => {
  const { stock_id, quantity } = req.body;
  if (!stock_id || !quantity) {
    throw new BadRequestError("Please provide all values");
  }
  const accessToken = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(accessToken, process.env.SOCKET_TOKEN_SECRET);
  const userId = decoded.userId;

  try {
    const stock = await Stock.findById(stock_id);
    if (!stock) {
      throw new BadRequestError("Stock not found");
    }

    const buyPrice = stock.currentPrice;
    const totalPrice = buyPrice * quantity;
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      throw new BadRequestError("User not found");
    }

    if (currentUser.balance < totalPrice) {
      throw new BadRequestError("Insufficient cash balance");
    }

    // Check Market Status
    const marketStatus = calculateMarketStatus(new Date());
    const isMarketOpen = marketStatus.isOpen;

    // Deduct balance (funds reserved)
    currentUser.balance -= totalPrice;
    await currentUser.save();

    if (isMarketOpen) {
      // 1. Instant Market Execution
      let holding = await Holding.findOne({ user: userId, stock: stock_id });
      if (holding) {
        const totalQty = holding.quantity + quantity;
        const totalCost = holding.buyPrice * holding.quantity + buyPrice * quantity;
        holding.quantity = totalQty;
        holding.buyPrice = totalCost / totalQty;
        await holding.save();
      } else {
        holding = new Holding({
          user: userId,
          stock: stock_id,
          quantity,
          buyPrice,
        });
        await holding.save();
      }

      const newOrder = new Order({
        user: userId,
        stock: stock_id,
        quantity,
        price: buyPrice,
        type: "buy",
        status: "EXECUTED",
        isAMO: false,
        executedAt: new Date(),
        remainingBalance: currentUser.balance,
      });
      await newOrder.save();

      res.status(StatusCodes.CREATED).json({
        msg: `Successfully purchased ${quantity} shares of ${stock.symbol}!`,
        data: {
          holding,
          order: newOrder,
          isAMO: false,
        },
      });
    } else {
      // 2. After-Market Order (AMO) Queue
      const newOrder = new Order({
        user: userId,
        stock: stock_id,
        quantity,
        price: buyPrice,
        type: "buy",
        status: "PENDING_AMO",
        isAMO: true,
        remainingBalance: currentUser.balance,
      });
      await newOrder.save();

      const nextOpenText = marketStatus.nextOpenFormatted
        ? `on ${marketStatus.nextOpenFormatted} at 9:30 AM`
        : "at 9:30 AM";

      res.status(StatusCodes.CREATED).json({
        msg: `After-Market Order (AMO) placed! Your order of ${quantity} shares of ${stock.symbol} will execute ${nextOpenText}.`,
        data: {
          order: newOrder,
          isAMO: true,
          nextOpenTime: marketStatus.nextOpenTime,
        },
      });
    }
  } catch (error) {
    throw new BadRequestError(error.message);
  }
};

const sellStock = async (req, res) => {
  const { holdingId, quantity } = req.body;
  if (!holdingId || !quantity) {
    throw new BadRequestError("Please provide all values");
  }

  try {
    const holding = await Holding.findById(holdingId);
    if (!holding) {
      throw new BadRequestError("Holding not found");
    }
    if (quantity > holding.quantity) {
      throw new BadRequestError("You cannot sell more shares than you currently own");
    }

    const stock = await Stock.findById(holding.stock);
    if (!stock) {
      throw new BadRequestError("Stock not found");
    }

    const sellPrice = quantity * stock.currentPrice;
    const currentUser = await User.findById(holding.user);
    if (!currentUser) {
      throw new BadRequestError("User not found");
    }

    // Check Market Status
    const marketStatus = calculateMarketStatus(new Date());
    const isMarketOpen = marketStatus.isOpen;

    if (isMarketOpen) {
      // 1. Instant Market Execution
      holding.quantity -= quantity;
      if (holding.quantity <= 0) {
        await Holding.findByIdAndDelete(holdingId);
      } else {
        await holding.save();
      }

      currentUser.balance += sellPrice;
      await currentUser.save();

      const newOrder = new Order({
        user: holding.user,
        stock: holding.stock,
        quantity,
        price: stock.currentPrice,
        type: "sell",
        status: "EXECUTED",
        isAMO: false,
        executedAt: new Date(),
        remainingBalance: currentUser.balance,
      });
      await newOrder.save();

      res.status(StatusCodes.OK).json({
        msg: `Successfully sold ${quantity} shares of ${stock.symbol}!`,
        data: {
          orderId: newOrder._id,
          sellPrice,
          isAMO: false,
        },
      });
    } else {
      // 2. After-Market Sell Order (AMO) Queue
      holding.quantity -= quantity;
      if (holding.quantity <= 0) {
        await Holding.findByIdAndDelete(holdingId);
      } else {
        await holding.save();
      }

      const newOrder = new Order({
        user: holding.user,
        stock: holding.stock,
        quantity,
        price: stock.currentPrice,
        type: "sell",
        status: "PENDING_AMO",
        isAMO: true,
        remainingBalance: currentUser.balance,
      });
      await newOrder.save();

      const nextOpenText = marketStatus.nextOpenFormatted
        ? `on ${marketStatus.nextOpenFormatted} at 9:30 AM`
        : "at 9:30 AM";

      res.status(StatusCodes.OK).json({
        msg: `After-Market Sell Order (AMO) placed! Funds will be credited ${nextOpenText} upon execution.`,
        data: {
          orderId: newOrder._id,
          isAMO: true,
          nextOpenTime: marketStatus.nextOpenTime,
        },
      });
    }
  } catch (error) {
    throw new BadRequestError(error.message);
  }
};

const getAllHoldings = async (req, res) => {
  const accessToken = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(accessToken, process.env.SOCKET_TOKEN_SECRET);
  const userId = decoded.userId;

  try {
    const holdings = await Holding.find({ user: userId }).populate({
      path: "stock",
      select: "symbol companyName iconUrl lastDayTradedPrice currentPrice",
    });
    res.status(StatusCodes.OK).json({
      msg: "Holdings retrieved successfully",
      data: holdings,
    });
  } catch (error) {
    throw new BadRequestError("Failed to retrieve holdings. " + error.message);
  }
};

export { buyStock, sellStock, getAllHoldings };
