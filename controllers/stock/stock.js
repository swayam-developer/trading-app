import { StatusCodes } from "http-status-codes";
import BadRequestError from "../../errors/bad-request.js";
import NotFoundError from "../../errors/not-found.js";
import Stock from "../../models/Stock.js";

const registerStock = async (req, res) => {
  {
    const { symbol, companyName, currentPrice, lastDayTradedPrice, iconUrl } =
      req.body;
    if (
      !symbol ||
      !companyName ||
      !currentPrice ||
      !lastDayTradedPrice ||
      !iconUrl
    ) {
      throw new BadRequestError("Please provide all values");
    }
    try {
      const stockAlreadyExists = await Stock.findOne({ symbol });
      if (stockAlreadyExists) {
        throw new BadRequestError("Stock already exists");
      }
      const stock = new Stock({
        symbol,
        companyName,
        currentPrice,
        lastDayTradedPrice,
        iconUrl,
      });
      await stock.save();
      res.status(StatusCodes.CREATED).json({
        msg: "Stock added successfully!",
        data: stock,
      });
    } catch (error) {
      throw new BadRequestError(error.message);
    }
  }
};

const HOLIDAYS = ["2026-05-18", "2026-05-31", "2026-08-24", "2026-08-31"];

const getMarketStatus = async (req, res) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekDay = dayOfWeek > 0 && dayOfWeek < 6;
  const today = now.toISOString().slice(0, 10);
  const isHoliday = HOLIDAYS.includes(today);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Market hours: 9:30 AM to 3:30 PM (930 minutes)
  const isTradingTime = totalMinutes >= 570 && totalMinutes <= 930;
  const isOpen = isWeekDay && isTradingTime && !isHoliday;

  let message = "Market Open";
  if (isHoliday) {
    message = "Market Closed (Holiday)";
  } else if (!isWeekDay) {
    message = "Market Closed (Weekend)";
  } else if (totalMinutes < 570) {
    message = "Market Opens at 9:30 AM";
  } else if (totalMinutes > 930) {
    message = "Market Closed at 3:30 PM";
  }

  res.status(StatusCodes.OK).json({
    msg: "Market status retrieved successfully",
    data: {
      isOpen,
      isTradingHour: isOpen,
      isHoliday,
      isWeekDay,
      message,
      holidays: HOLIDAYS,
      marketHours: {
        open: "09:30",
        close: "15:30",
      },
      serverTime: now.toISOString(),
    },
  });
};

const getAllStocks = async (req, res) => {
  try {
    const stocks = await Stock.find().select(
      "-dayTimeSeries -tenMinTimeSeries",
    );
    res.status(StatusCodes.OK).json({
      msg: "Stocks retrieved Successfully",
      data: stocks,
    });
  } catch (error) {
    throw new BadRequestError("Failed to retrieve stocks. " + error.message);
  }
};

const getStockBySymbol = async (req, res) => {
  const { stock: symbol } = req.query;

  if (!symbol) {
    throw new BadRequestError("Please provide stock symbol");
  }
  try {
    const stock = await Stock.findOne({ symbol });
    if (!stock) {
      throw new NotFoundError("Stock not found!");
    }
    res.status(StatusCodes.OK).json({
      msg: "Stock retrieved successfully",
      data: stock,
    });
  } catch (error) {
    throw new BadRequestError("Failed to retrieve stock. " + error.message);
  }
};

export { registerStock, getAllStocks, getStockBySymbol, getMarketStatus };