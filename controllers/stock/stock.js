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
  // 2026 Indian Market (NSE/BSE) Holidays
  { date: "2026-01-26", name: "Republic Day" },
  { date: "2026-03-03", name: "Holi" },
  { date: "2026-03-20", name: "Id-Ul-Fitr (Ramzan Eid)" },
  { date: "2026-03-27", name: "Shri Ram Navami" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-14", name: "Dr. Baba Saheb Ambedkar Jayanti" },
  { date: "2026-05-01", name: "Maharashtra Day" },
  { date: "2026-05-27", name: "Bakri Id (Eid-Ul-Adha)" },
  { date: "2026-06-26", name: "Muharram" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2026-10-20", name: "Dussehra" },
  { date: "2026-11-10", name: "Diwali Balipratipada" },
  { date: "2026-11-24", name: "Gurunanak Jayanti" },
  { date: "2026-12-25", name: "Christmas Day" },

  // 2027 Indian Market (NSE/BSE) Holidays
  { date: "2027-01-26", name: "Republic Day" },
  { date: "2027-03-22", name: "Holi" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-04-14", name: "Dr. Baba Saheb Ambedkar Jayanti" },
  { date: "2027-05-01", name: "Maharashtra Day" },
  { date: "2027-10-28", name: "Diwali Balipratipada" },
  { date: "2027-11-15", name: "Gurunanak Jayanti" },
];

/**
 * Extracts date and time components in Indian Standard Time (IST - Asia/Kolkata)
 */
const getISTDateTime = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[map.weekday] ?? 0;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr,
    dayOfWeek,
    totalMinutes: hour * 60 + minute,
  };
};

const calculateMarketStatus = (now = new Date()) => {
  const ist = getISTDateTime(now);
  const dayOfWeek = ist.dayOfWeek; // 0 = Sun, 6 = Sat
  const isWeekDay = dayOfWeek > 0 && dayOfWeek < 6;
  const today = ist.dateStr;
  const todayHoliday = HOLIDAY_CALENDAR.find((h) => h.date === today) || null;
  const isHoliday = !!todayHoliday;

  const totalMinutes = ist.totalMinutes;

  // Market hours: 9:30 AM (570 min) to 3:30 PM (930 min) IST
  const isTradingTime = totalMinutes >= 570 && totalMinutes <= 930;
  const isOpen = isWeekDay && isTradingTime && !isHoliday;

  // Check Tomorrow's status (in IST)
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIST = getISTDateTime(tomorrowDate);
  const tomorrowStr = tomorrowIST.dateStr;
  const tomorrowDay = tomorrowIST.dayOfWeek;
  const tomorrowHoliday = HOLIDAY_CALENDAR.find((h) => h.date === tomorrowStr) || null;
  const isTomorrowWeekend = tomorrowDay === 0 || tomorrowDay === 6;
  const isTomorrowClosed = isTomorrowWeekend || !!tomorrowHoliday;
  const tomorrowReason = tomorrowHoliday
    ? `Holiday: ${tomorrowHoliday.name}`
    : isTomorrowWeekend
    ? "Weekend"
    : null;

  // Calculate next opening trading date and time in IST
  let daysForward = 0;
  let nextOpenDateStr = today;
  while (daysForward < 14) {
    if (daysForward === 0 && isWeekDay && totalMinutes < 570 && !isHoliday) {
      // Opens today at 9:30 AM IST
      nextOpenDateStr = today;
      break;
    }
    daysForward++;
    const testDate = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
    const testIST = getISTDateTime(testDate);
    const testHoliday = HOLIDAY_CALENDAR.some((h) => h.date === testIST.dateStr);
    if (testIST.dayOfWeek > 0 && testIST.dayOfWeek < 6 && !testHoliday) {
      nextOpenDateStr = testIST.dateStr;
      break;
    }
  }

  const nextOpenTime = new Date(`${nextOpenDateStr}T09:30:00+05:30`).toISOString();
  const nextOpenFormatted = new Date(`${nextOpenDateStr}T09:30:00+05:30`).toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Calculate upcoming multi-day closure spans in next 30 days
  const upcomingClosures = [];
  const nowDateOnly = new Date(`${today}T00:00:00+05:30`);

  for (const h of HOLIDAY_CALENDAR) {
    const hDate = new Date(`${h.date}T00:00:00+05:30`);
    const diffDays = Math.ceil((hDate - nowDateOnly) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 30) {
      const hDay = getISTDateTime(hDate).dayOfWeek;
      let fromDate = h.date;
      let toDate = h.date;
      let totalDays = 1;
      let reason = h.name;

      if (hDay === 1) {
        // Monday Holiday -> Closed Sat to Mon (3 days)
        const sat = new Date(hDate.getTime() - 2 * 24 * 60 * 60 * 1000);
        fromDate = getISTDateTime(sat).dateStr;
        toDate = h.date;
        totalDays = 3;
        reason = `${h.name} (Long Weekend)`;
      } else if (hDay === 5) {
        // Friday Holiday -> Closed Fri to Sun (3 days)
        const sun = new Date(hDate.getTime() + 2 * 24 * 60 * 60 * 1000);
        fromDate = h.date;
        toDate = getISTDateTime(sun).dateStr;
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
    nextOpenTime,
    nextOpenFormatted,
    upcomingClosures,
    holidays: HOLIDAY_CALENDAR.map((h) => h.date),
    holidayCalendar: HOLIDAY_CALENDAR,
    marketHours: {
      open: "09:30",
      close: "15:30",
      timezone: "Asia/Kolkata",
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