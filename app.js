import "express-async-errors";
import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import swaggerUI from "swagger-ui-express";
import YAML from "yamljs";
import cors from "cors";
import connectDB from "./config/connect.js";
import authRouter from "./routes/auth.js";
import stockRouter from "./routes/stock.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import notFoundMiddleware from "./middleware/not-found.js";
import errorHandlerMiddleware from "./middleware/error-handler.js";
import authenticateSocketUser from "./middleware/socketAuth.js";
import {
  scheduleDayReset,
  update10MinCandle,
  generateRandomDataEvery5Second,
} from "./services/cronJob.js";
import Stock from "./models/Stock.js";
import socketHandshake from "./middleware/socketHandshake.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

scheduleDayReset();
generateRandomDataEvery5Second();
update10MinCandle();

const holidays = ["2026-05-18", "2026-05-31"];

const isTradingHour = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekDay = dayOfWeek > 0 && dayOfWeek < 6;

  const isTradingTime =
    (now.getHours() === 9 && now.getMinutes() >= 30) ||
    (now.getHours() > 9 && now.getMinutes() < 15) ||
    (now.getHours() === 15 && now.getMinutes() <= 30);

  const today = new Date().toISOString().slice(0, 10);
  const isTradingHour = isWeekDay && isTradingTime && !holidays.includes(today);

  return true;
};

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: process.env.WEBSERVER_URI || "http://localhost:3001",
    methods: ["GET", "POST"],
    allowedHeaders: ["access_token"],
    credentials: true,
  },
});
io.use(socketHandshake);

io.on("connection", (socket) => {
  console.log("New Client Connected", socket.id);

  socket.on("SubscribeToStocks", async (stockSymbol) => {
    console.log(`Client ${socket.id} subscribed to stock: ${stockSymbol}`);
    const sendUpdates = async () => {
      try {
        const stock = await Stock.findOne({ symbol: stockSymbol });
        if (!stock) {
          console.error(`Stock with symbol ${stockSymbol} not found.`);
          return;
        } else {
          socket.emit(`${stockSymbol}`, stock);
        }
      } catch (error) {
        console.error("Error sending stock update:", error);
      }
    };

    await sendUpdates();

    const intervalId = setInterval(() => {
      if (isTradingHour()) {
        sendUpdates();
      }
    }, 5000);

    socket.on("disconnect", () => {
      clearInterval(intervalId);
    });
  });

  socket.on("subscribeToMultipleStocks", async (stockSymbols) => {
    console.log(
      `Client ${socket.id} subscribed to multiple stocks: ${stockSymbols}`,
    );
    const sendUpdates = async () => {
      try {
        for (const symbol of stockSymbols) {
          const stock = await Stock.findOne({ symbol: symbol });
          if (!stock) {
            console.error(`Stock with symbol ${symbol} not found`);
            continue;
          } else {
            socket.emit(`${symbol}`, stock);
          }
        }
      } catch (error) {
        console.error("Error sending stock update:", error);
      }
    };

    await sendUpdates();

    const intervalId = setInterval(() => {
      if (isTradingHour()) {
        sendUpdates();
      }
    }, 5000);

    socket.on("disconnect", () => {
      clearInterval(intervalId);
    });
  });

  socket.on("disconnect", () => {
    console.log("A client disconnected");
  });
});

app.get("/", (req, res) => {
  res.send('<h1>Trading API</h1><a href="/api-docs">Document</a>');
});

// swagger api docs

const swaggerDocument = YAML.load(join(__dirname, "./docs/swagger.yaml"));
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerDocument));

// routes
app.use("/auth", authRouter);
app.use("/stocks", authenticateSocketUser, stockRouter);

// Middleware
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// start server

const start = async () => {
  try {
    const dbUri = process.env.MONGODB_URI;
    await connectDB(dbUri);
    console.log("mongodb is connected");
    const PORT = process.env.PORT || 3000;
    const SOCKET_PORT = process.env.SOCKET_PORT || 4000;

    httpServer.listen(SOCKET_PORT, () => {
      console.log(
        `Websocket server is running and listening on PORT ${SOCKET_PORT}`,
      );
    });

    app.listen(PORT, () =>
      console.log(`Server is listening on port ${PORT}...`),
    );
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
      console.error(
        "Tip: No MONGO_URI set in .env. Ensure local MongoDB service is running or set MONGO_URI in server/.env",
      );
    }
  }
};

start();
