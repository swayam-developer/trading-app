import  NotFoundError  from "../errors/not-found.js";
import Stock from "../models/Stock.js";

const roundToTwoDecimals = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const generateStockData = async (symbol) => {
  const stock = await Stock.findOne({ symbol });
  if (!stock) {
    throw new NotFoundError(`Stock with symbol ${symbol} not found`);
  }
  const now = new Date();
  const basePrice = stock.lastDayTradedPrice || 100;
  const currentPrice = stock.currentPrice || basePrice;
  const changePercentage = (Math.random() - 0.49) * 0.008;

  let close = roundToTwoDecimals(currentPrice * (1 + changePercentage));
  if (close > basePrice * 1.12) close = roundToTwoDecimals(basePrice * 1.10);
  if (close < basePrice * 0.88) close = roundToTwoDecimals(basePrice * 0.90);

  const patternType = Math.random();
  let high, low;

  if (patternType < 0.15) {
    high = Math.max(currentPrice, close);
    low = Math.min(currentPrice, close);
  } else if (patternType < 0.3) {
    high = Math.max(currentPrice, close);
    low = Math.min(currentPrice, close) - Math.random() * 2;
  } else if (patternType < 0.45) {
    high = Math.max(currentPrice, close) + Math.random() * 2;
    low = Math.min(currentPrice, close);
  } else if (patternType < 0.6) {
    high = Math.max(currentPrice, close) + Math.random() * 2;
    low = Math.min(currentPrice, close);
  } else {
    if (Math.random() < 0.5) {
      high = close + Math.random() * 4;
      low = close - Math.random() * 2;
    } else {
      high = close + Math.random() * 2;
      low = close - Math.random() * 4;
    }
  }

  high = roundToTwoDecimals(high);
  low = roundToTwoDecimals(low);

  const timeStamp = now.toISOString();
  const time = now.getTime() / 1000;
  const lastItem = stock.dayTimeSeries[stock.dayTimeSeries.length - 1];

  if (!lastItem || now - new Date(lastItem.timestamp) > 1 * 60 * 1000) {
    stock.dayTimeSeries.push({
      timeStamp,
      time,
      _internal_originalTime: time,
      open: roundToTwoDecimals(currentPrice),
      high,
      low,
      close,
    });
  } else {
    const updateHigh = Math.max(lastItem.high, close + Math.random() * 1);
    const updateLow = Math.min(lastItem.low, close - Math.random() * 1);
    const updateCandle = {
      high: roundToTwoDecimals(updateHigh),
      low: roundToTwoDecimals(updateLow),
      close: roundToTwoDecimals(close),
      open: lastItem.open,
      timeStamp: lastItem.timeStamp,
      time: lastItem.time,
      _internal_originalTime: lastItem._internal_originalTime,
    };
    stock.dayTimeSeries[stock.dayTimeSeries.length - 1] = updateCandle;
  }
  stock.dayTimeSeries = stock.dayTimeSeries.slice(-390);

  stock.currentPrice = close;
  try {
    await stock.save();
  } catch (error) {
    console.log("Skipping Conflicts");
  }
};

const store10Min = async (symbol) => {
  const stock = await Stock.findOne({ symbol });
  if (!stock) {
    throw new NotFoundError("Stock not found!");
  }
  const now = new Date();
  const currentPrice = stock.currentPrice;
  const latestItem = stock.dayTimeSeries[stock.dayTimeSeries.length - 1];

  const timeStamp = now.toISOString();
  const time = now.getTime() / 1000;

  stock.tenMinTimeSeries.push({
    timeStamp,
    time,
    _internal_originalTime: time,
    open: roundToTwoDecimals(currentPrice),
    high: roundToTwoDecimals(latestItem.high),
    low: roundToTwoDecimals(latestItem.low),
    close: roundToTwoDecimals(latestItem.close),
  });
  try {
    await stock.save();
  } catch (error) {
    console.log("Skipping Conflicts");
  }
};

export { generateStockData, store10Min };
