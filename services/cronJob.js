import mongoose from "mongoose";
import Stock from "../models/Stock.js";
import { generateStockData, store10Min } from "./stockUtils.js";
import cron from "node-cron";

const holidays = ["2026-08-24", "2026-08-31"];

const isTradingHour = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekDay = dayOfWeek > 0 && dayOfWeek < 6;
  const isTradingTime =
    (now.getHours() === 9 && now.getMinutes() >= 30) ||
    (now.getHours() > 9 && now.getMinutes() < 15) ||
    (now.getHours() === 15 && now.getMinutes() <= 30);

  const today = new Date().toISOString().slice(0, 10);
  return isWeekDay && isTradingTime && !holidays.includes(today);
};

const isNewTradeDay = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekDay = dayOfWeek > 0 && dayOfWeek < 6;
  const today = new Date().toISOString().slice(0, 10);
  return isWeekDay && !holidays.includes(today);
};

const isDBConnected = () => mongoose.connection.readyState === 1;

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

const generateRandomDataEvery5Second = () => {
  cron.schedule("*/5 * * * * *", async () => {
    if (!isDBConnected()) return;
    if (!isTradingHour()) {
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
  update10MinCandle,
  generateRandomDataEvery5Second,
  isTradingHour,
};
