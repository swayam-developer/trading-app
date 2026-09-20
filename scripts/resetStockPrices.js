import dotenv from "dotenv";
import connectDB from "../config/connect.js";
import Stock from "../models/Stock.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const resetPrices = async () => {
  try {
    console.log("🔌 Connecting to database...");
    await connectDB(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("✅ Connected!");

    const stocksDataPath = path.join(__dirname, "../data/stocks.json");
    const stocksData = JSON.parse(fs.readFileSync(stocksDataPath, "utf8"));

    for (const item of stocksData) {
      const parsedLtp = parseFloat(item.lastDayTradedPrice) || 100;
      const parsedCurr = parseFloat(item.currentPrice) || parsedLtp;

      await Stock.updateOne(
        { symbol: item.symbol },
        {
          $set: {
            currentPrice: parsedCurr,
            lastDayTradedPrice: parsedLtp,
            companyName: item.companyName,
            iconUrl: item.iconUrl,
          },
        },
        { upsert: true }
      );
      console.log(`Reset ${item.symbol} -> $${parsedCurr}`);
    }

    console.log("🎉 All stocks successfully reset to real prices!");
  } catch (err) {
    console.error("❌ Error resetting:", err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

resetPrices();
