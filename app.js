import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import "express-async-errors";
import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import swaggerUI from "swagger-ui-express";
import YAML from "yamljs";
import cors from "cors";
import mongoose from "mongoose";
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
  scheduleAMORunner,
  update10MinCandle,
  generateRandomDataEvery5Second,
} from "./services/cronJob.js";
import Stock from "./models/Stock.js";
import socketHandshake from "./middleware/socketHandshake.js";
import { getFirebaseStatus } from "./services/fcmService.js";
import { calculateMarketStatus } from "./controllers/stock/stock.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const isTradingHour = () => {
  return calculateMarketStatus(new Date()).isOpen;
};

// Express App Initialization
const app = express();
app.use(cors());
app.use(express.json());

// Attach Socket.IO to the Express HTTP Server (Unified single-port for Render)
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.WEBSERVER_URI || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["access_token", "authorization", "content-type"],
    credentials: true,
  },
});

io.use(socketHandshake);

io.on("connection", (socket) => {
  console.log("New Client Connected", socket.id);

  // Send immediate market status and holiday calendar on connect
  socket.emit("marketStatus", calculateMarketStatus(new Date()));

  socket.on("getMarketStatus", () => {
    socket.emit("marketStatus", calculateMarketStatus(new Date()));
  });

  socket.on("SubscribeToStocks", async (stockSymbol) => {
    console.log(`Client ${socket.id} subscribed to stock: ${stockSymbol}`);
    const sendUpdates = async () => {
      try {
        if (mongoose.connection.readyState !== 1) return;
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
        if (mongoose.connection.readyState !== 1) return;
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

// ==========================================
// HEALTH CHECK ENDPOINTS (GET & HEAD)
// ==========================================

// Fast, granular health check endpoint for UptimeRobot / Render
app.get("/health", (req, res) => {
  const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const mongoStateNum = mongoose.connection.readyState;
  const mongoStatus = mongoStates[mongoStateNum] || "unknown";
  const firebaseStatus = getFirebaseStatus();

  res.status(200).json({
    status: mongoStateNum === 1 ? "ok" : "degraded",
    service: "trading-app-server",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      process: "alive",
      http: "responding",
      mongodb: {
        status: mongoStatus,
        readyState: mongoStateNum,
      },
      firebase: firebaseStatus,
      websocket: {
        status: "ready",
        connectedClients: io.engine ? io.engine.clientsCount : 0,
      },
    },
  });
});

app.head("/health", (req, res) => {
  res.status(200).end();
});

// Root routes (GET & HEAD)
app.head("/", (req, res) => {
  res.status(200).end();
});

app.get("/", (req, res) => {
  res.status(200).send(
    '<h1>Trading API</h1><p>Status: Running</p><p><a href="/api-docs">API Documentation</a> | <a href="/health">Health Check</a></p>',
  );
});

// Swagger API docs
try {
  const swaggerDocument = YAML.load(join(__dirname, "./docs/swagger.yaml"));
  app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerDocument));
} catch (err) {
  console.warn("Could not load swagger.yaml:", err.message);
}

// Routes
app.use("/auth", authRouter);
app.use("/stocks", authenticateSocketUser, stockRouter);

// Middleware
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// ==========================================
// SERVER STARTUP (Non-blocking Cold Start)
// ==========================================

const PORT = process.env.PORT || 3000;

// 1. Immediately bind and listen to HTTP/WebSocket port
httpServer.listen(PORT, () => {
  console.log(`Server and WebSocket listening on port ${PORT}...`);
});

// 2. Connect to MongoDB in the background without blocking server listening
const connectWithRetry = async () => {
  const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!dbUri) {
    console.error(
      "Warning: Neither MONGODB_URI nor MONGO_URI is set. Database operations will fail.",
    );
    return;
  }

  try {
    await connectDB(dbUri);
    console.log("MongoDB is connected successfully");

    // Initialize cron jobs once MongoDB is connected
    scheduleDayReset();
    scheduleAMORunner();
    generateRandomDataEvery5Second();
    update10MinCandle();
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    console.log("Retrying MongoDB connection in 5 seconds...");
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

export { app, httpServer, io };
