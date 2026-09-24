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

const HOLIDAY_CALENDAR = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
  { date: "2026-02-16", name: "Presidents' Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-18", name: "Victoria Day / Early Summer Break" },
  { date: "2026-05-25", name: "Memorial Day" },
  { date: "2026-05-31", name: "Summer Market Holiday" },
  { date: "2026-06-19", name: "Juneteenth National Independence Day" },
  { date: "2026-07-03", name: "Independence Day (Observed)" },
  { date: "2026-08-24", name: "Late Summer Trading Holiday" },
  { date: "2026-08-31", name: "End of Summer Recess" },
  { date: "2026-09-07", name: "Labor Day" },
  { date: "2026-11-26", name: "Thanksgiving Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-18", name: "Martin Luther King Jr. Day" },
  { date: "2027-02-15", name: "Presidents' Day" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-05-31", name: "Memorial Day" },
  { date: "2027-06-18", name: "Juneteenth (Observed)" },
  { date: "2027-07-05", name: "Independence Day (Observed)" },
  { date: "2027-09-06", name: "Labor Day" },
  { date: "2027-11-25", name: "Thanksgiving Day" },
  { date: "2027-12-24", name: "Christmas Day (Observed)" },
];

const calculateMarketStatus = (now = new Date()) => {
  const dayOfWeek = now.getDay(); // 0 = Sun, 6 = Sat
  const isWeekDay = dayOfWeek > 0 && dayOfWeek < 6;
  const today = now.toISOString().slice(0, 10);
  const todayHoliday = HOLIDAY_CALENDAR.find((h) => h.date === today) || null;
  const isHoliday = !!todayHoliday;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Market hours: 9:30 AM (570 min) to 3:30 PM (930 min)
  const isTradingTime = totalMinutes >= 570 && totalMinutes <= 930;
  const isOpen = isWeekDay && isTradingTime && !isHoliday;

  // Check Tomorrow's status
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
  const tomorrowDay = tomorrowDate.getDay();
  const tomorrowHoliday = HOLIDAY_CALENDAR.find((h) => h.date === tomorrowStr) || null;
  const isTomorrowWeekend = tomorrowDay === 0 || tomorrowDay === 6;
  const isTomorrowClosed = isTomorrowWeekend || !!tomorrowHoliday;
  const tomorrowReason = tomorrowHoliday
    ? `Holiday: ${tomorrowHoliday.name}`
    : isTomorrowWeekend
    ? "Weekend"
    : null;

  // Calculate next opening trading date and time
  const nextOpen = new Date(now);
  let daysForward = 0;
  while (daysForward < 14) {
    if (daysForward === 0 && isWeekDay && totalMinutes < 570 && !isHoliday) {
      // Opens today at 9:30 AM
      break;
    }
    daysForward++;
    const testDate = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
    const testDay = testDate.getDay();
    const testStr = testDate.toISOString().slice(0, 10);
    const testHoliday = HOLIDAY_CALENDAR.some((h) => h.date === testStr);
    if (testDay > 0 && testDay < 6 && !testHoliday) {
      nextOpen.setTime(testDate.getTime());
      break;
    }
  }
  nextOpen.setHours(9, 30, 0, 0);

  const nextOpenFormatted = nextOpen.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Calculate upcoming multi-day closure spans in next 30 days
  const upcomingClosures = [];
  const nowDateOnly = new Date(today);

  for (const h of HOLIDAY_CALENDAR) {
    const hDate = new Date(h.date);
    const diffDays = Math.ceil((hDate - nowDateOnly) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 30) {
      const hDay = hDate.getDay();
      let fromDate = h.date;
      let toDate = h.date;
      let totalDays = 1;
      let reason = h.name;

      if (hDay === 1) {
        // Monday Holiday -> Closed Sat to Mon (3 days)
        const sat = new Date(hDate.getTime() - 2 * 24 * 60 * 60 * 1000);
        fromDate = sat.toISOString().slice(0, 10);
        toDate = h.date;
        totalDays = 3;
        reason = `${h.name} (Long Weekend)`;
      } else if (hDay === 5) {
        // Friday Holiday -> Closed Fri to Sun (3 days)
        const sun = new Date(hDate.getTime() + 2 * 24 * 60 * 60 * 1000);
        fromDate = h.date;
        toDate = sun.toISOString().slice(0, 10);
        totalDays = 3;
        reason = `${h.name} (Long Weekend)`;
      }

      upcomingClosures.push({
        from: fromDate,
        to: toDate,
        reason,
        totalDays,
        daysUntil: diffDays,
        holidayName: h.name,
      });
    }
  }

  // Determine Primary Alert Message & Type
  let message = "Market Open";
  let alertType = "open";
  let alertTitle = "Market is Open 🟢";
  let alertMessage = "Live trading is currently active until 3:30 PM.";
  let alertDateRange = undefined;

  if (isHoliday) {
    message = `Market Closed (${todayHoliday.name})`;
    alertType = "holiday_today";
    alertTitle = "Market Holiday Today 🏖️";
    alertMessage = `Markets are closed today for ${todayHoliday.name}. Trading resumes ${nextOpenFormatted} at 9:30 AM.`;
    alertDateRange = "Today";
  } else if (!isWeekDay) {
    message = "Market Closed (Weekend)";
    alertType = "closed";
    alertTitle = "Market Closed (Weekend) ⏸️";
    alertMessage = `Markets are closed for the weekend. Reopens ${nextOpenFormatted} at 9:30 AM.`;
    alertDateRange = "This Weekend";
  } else if (totalMinutes < 570) {
    message = "Market Opens at 9:30 AM";
    alertType = "closed";
    alertTitle = "Market Opening Soon 🌅";
    alertMessage = "Live trading opens today at 9:30 AM.";
  } else if (totalMinutes > 930) {
    message = "Market Closed at 3:30 PM";
    alertType = "closed";
    alertTitle = "Market Closed for Today 🌆";
    if (isTomorrowClosed) {
      alertMessage = `Trading ended at 3:30 PM. Closed tomorrow (${tomorrowReason}). Reopens ${nextOpenFormatted}.`;
      alertDateRange = "Tomorrow";
    } else {
      alertMessage = `Trading ended at 3:30 PM. Reopens tomorrow at 9:30 AM.`;
    }
  } else if (isTomorrowClosed && totalMinutes >= 840) {
    // 2:00 PM onwards alert about tomorrow closure
    alertType = "closed_tomorrow";
    alertTitle = "Market Open 🟢 (Closed Tomorrow)";
    alertMessage = `Trading active until 3:30 PM. Note: Markets will be closed tomorrow (${tomorrowReason}).`;
    alertDateRange = "Tomorrow";
  }

  return {
    isOpen,
    isTradingHour: isOpen,
    isHoliday,
    isWeekDay,
    message,
    todayHoliday,
    isTomorrowClosed,
    tomorrowReason,
    nextOpenTime: nextOpen.toISOString(),
    nextOpenFormatted,
    upcomingClosures,
    holidays: HOLIDAY_CALENDAR.map((h) => h.date),
    holidayCalendar: HOLIDAY_CALENDAR,
    marketHours: {
      open: "09:30",
      close: "15:30",
      timezone: "America/New_York",
    },
    serverTime: now.toISOString(),
    alert: {
      type: alertType,
      title: alertTitle,
      message: alertMessage,
      dateRange: alertDateRange,
    },
  };
};

const getMarketStatus = async (req, res) => {
  const statusData = calculateMarketStatus(new Date());
  res.status(StatusCodes.OK).json({
    msg: "Market status retrieved successfully",
    data: statusData,
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

export {
  registerStock,
  getAllStocks,
  getStockBySymbol,
  getMarketStatus,
  calculateMarketStatus,
  HOLIDAY_CALENDAR,
};