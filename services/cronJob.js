import mongoose from "mongoose";
import Stock from "../models/Stock.js";
import User from "../models/User.js";
import Holding from "../models/Holding.js";
import Order from "../models/Order.js";
import { generateStockData, store10Min } from "./stockUtils.js";
import { calculateMarketStatus } from "../controllers/stock/stock.js";
import cron from "node-cron";

const isTradingHour = () => {
  return calculateMarketStatus(new Date()).isOpen;
};

const isNewTradeDay = () => {
  const status = calculateMarketStatus(new Date());
  return status.isWeekDay && !status.isHoliday;
};

const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * Execute all queued After-Market Orders (AMO) at Market Open (9:30 AM)
 */
const executePendingAMOOrders = async () => {
  if (!isDBConnected()) return;
  console.log("[AMO Engine] Processing queued After-Market Orders for market open...");

  try {
    const pendingOrders = await Order.find({ status: "PENDING_AMO" }).populate("stock");
    if (!pendingOrders || pendingOrders.length === 0) {
      console.log("[AMO Engine] No pending AMO orders to execute.");
      return;
    }

    for (const order of pendingOrders) {
      try {
        const stock = order.stock;
        if (!stock) continue;

        if (order.type === "buy") {
          // Find or create holding
          const existingHolding = await Holding.findOne({
            user: order.user,
            stock: stock._id,
          });

          if (existingHolding) {
            // Weighted average buy price
            const totalQty = existingHolding.quantity + order.quantity;
            const totalCost = (existingHolding.buyPrice * existingHolding.quantity) + (stock.currentPrice * order.quantity);
            existingHolding.quantity = totalQty;
            existingHolding.buyPrice = totalCost / totalQty;
            await existingHolding.save();
          } else {
            const newHolding = new Holding({
              user: order.user,
              stock: stock._id,
              quantity: order.quantity,
              buyPrice: stock.currentPrice,
            });
            await newHolding.save();
          }

          order.status = "EXECUTED";
          order.executedAt = new Date();
          order.price = stock.currentPrice;
          await order.save();
          console.log(`[AMO Engine] Executed BUY AMO order ${order._id} for ${order.quantity} shares of ${stock.symbol}`);
        } else if (order.type === "sell") {
          const holding = await Holding.findOne({
            user: order.user,
            stock: stock._id,
          });

          if (holding && holding.quantity >= order.quantity) {
            holding.quantity -= order.quantity;
            if (holding.quantity <= 0) {
              await Holding.findByIdAndDelete(holding._id);
            } else {
              await holding.save();
            }

            const sellRevenue = order.quantity * stock.currentPrice;
            const user = await User.findById(order.user);
            if (user) {
              user.balance += sellRevenue;
              await user.save();
              order.remainingBalance = user.balance;
            }

            order.status = "EXECUTED";
            order.executedAt = new Date();
            order.price = stock.currentPrice;
            await order.save();
            console.log(`[AMO Engine] Executed SELL AMO order ${order._id} for ${order.quantity} shares of ${stock.symbol}`);
          } else {
            order.status = "CANCELLED";
            await order.save();
            console.warn(`[AMO Engine] Cancelled SELL AMO order ${order._id}: Insufficient shares`);
          }
        }
      } catch (orderErr) {
        console.error(`[AMO Engine] Error processing order ${order._id}:`, orderErr.message);
      }
    }
  } catch (err) {
    console.error("[AMO Engine] Error in executePendingAMOOrders:", err.message);
  }
};

const scheduleDayReset = () => {
  cron.schedule("15 9 * * 1-5", async () => {
    if (!isDBConnected()) return;
    if (isNewTradeDay()) {
      try {
        await Stock.updateMany({}, [
          {
            $set: {
              dayTimeSeries: [],
              tenMinTimeSeries: [],
              lastDayTradedPrice: "$currentPrice",
            },
          },
          {
            $set: { __v: 0 },
          },
        ]);
        console.log("Day reset completed at 9:15 AM");
      } catch (err) {
        console.error("Error in scheduleDayReset:", err.message);
      }
    }
  });
};

const scheduleAMORunner = () => {
  // Execute queued AMOs at 9:30 AM on trading days
  cron.schedule("30 9 * * 1-5", async () => {
    if (!isDBConnected()) return;
    if (isNewTradeDay()) {
      await executePendingAMOOrders();
    }
  });
};

const update10MinCandle = () => {
  cron.schedule("*/10 * * * *", async () => {
    if (!isDBConnected()) return;
    if (isTradingHour()) {
      try {
        const stock = await Stock.find();
        for (const s of stock) {
          await store10Min(s.symbol);
        }
      } catch (err) {
        console.error("Error in update10MinCandle:", err.message);
      }
    }
  });
};

/**
 * Generate simulated price ticks ONLY during active trading hours (9:30 AM - 3:30 PM)
 * When market is closed, prices remain strictly frozen at closing price.
 */
const generateRandomDataEvery5Second = () => {
  cron.schedule("*/5 * * * * *", async () => {
    if (!isDBConnected()) return;
    if (isTradingHour()) {
      try {
        const stock = await Stock.find();
        for (const s of stock) {
          await generateStockData(s.symbol);
        }
      } catch (err) {
        console.error("Error in generateRandomDataEvery5Second:", err.message);
      }
    }
  });
};

export {
  scheduleDayReset,
  scheduleAMORunner,
  update10MinCandle,
  generateRandomDataEvery5Second,
  executePendingAMOOrders,
  isTradingHour,
};
