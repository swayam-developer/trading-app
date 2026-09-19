import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
  },
  companyName: {
    type: String,
    required: true,
  },
  iconUrl: {
    type: String,
    required: true,
  },
  lastDayTradedPrice: {
    type: Number,
    required: true,
  },
  currentPrice: {
    type: Number,
    required: true,
  },
  dayTimeSeries: {
    type: [Object],
    default: [],
  },
  tenMinTimeSeries: {
    type: [Object],
    default: [],
  },
});

const Stock = mongoose.model("Stock", stockSchema);
export default Stock;
