console.log("🔥 THIS IS MY SERVER FILE RUNNING");

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dns from "dns";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { startAutomationEngine } from "./src/core/jobs/orderEngine.js";

// ✅ Initialize Subscription & Order Cron Jobs
import "./cron/subscriptionCron.js";

export let ioInstance;

// Routes
import subscriptionRoutes from "./src/features/subscription/subscription.routes.js";
import providerRoutes from "./src/features/provider/provider.routes.js";
import vendorRoutes from "./src/features/vendor/vendor.routes.js";
import productRoutes from "./src/features/product/product.routes.js";
import deliveryRoutes from "./src/features/delivery/delivery.routes.js";
import categoryRoutes from "./src/features/category/category.routes.js";
import orderRoutes from "./src/features/automation/order.routes.js";

dotenv.config();

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();

// ✅ Allowed Origins (Dynamic + Local + Production)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",")
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
      "http://localhost:5177",
      "http://localhost:5178",
      "http://localhost:3000",
      "http://localhost:3001",
      "https://wellwigenportfolio-3e9d.vercel.app",
    ];

// ✅ FIXED CORS (Main Issue Solved Here)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow Postman / mobile apps

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("❌ Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ================= SOCKET SETUP =================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});
ioInstance = io;

let users = {};

app.set("io", io);
app.set("users", users);

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("registerUser", (userId) => {
    users[userId] = socket.id;
    console.log("✅ User mapped:", userId, socket.id);
  });

  // Re-broadcast order status updates (for real-time sync between vendor/user dashboards)
  socket.on("updateOrderStatus", (data) => {
    console.log("📡 [SOCKET_REBROADCAST] Received updateOrderStatus from client:", data);
    const clientsCount = io.engine.clientsCount;
    console.log(`📡 [SOCKET_REBROADCAST] Broadcasting 'orderStatusUpdated' to ${clientsCount} clients...`);
    io.emit("orderStatusUpdated", data);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    for (let id in users) {
      if (users[id] === socket.id) {
        delete users[id];
        break;
      }
    }
  });
});
// =================================================

// Routes
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/product", productRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/provider", providerRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/orders", orderRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ GLOBAL_SERVER_ERROR:", err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message
  });
});

// Test Route
app.post("/test", (req, res) => {
  console.log("✅ TEST ROUTE HIT");
  res.send("Test OK");
});

app.get("/", (req, res) => {
  res.send("WellWigen Backend Running 🚀");
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URL, { dbName: "wellwigen" })
  .then(() => {
    console.log("✅ MongoDB Connected");
    // startAutomationEngine();
  })
  .catch((err) => console.log("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});