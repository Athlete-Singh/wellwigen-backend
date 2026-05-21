console.log("🔥 THIS IS MY SERVER FILE RUNNING");

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dns from "dns";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import os from "os";
import { startAutomationEngine } from "./src/core/jobs/orderEngine.js";

// ✅ Initialize Subscription & Order Cron Jobs
import { initSubscriptionSocket } from "./cron/subscriptionCron.js";

export let ioInstance;

// Routes
import subscriptionRoutes from "./src/features/subscription/subscription.routes.js";
import providerRoutes from "./src/features/provider/provider.routes.js";
import vendorRoutes from "./src/features/vendor/vendor.routes.js";
import productRoutes from "./src/features/product/product.routes.js";
import deliveryRoutes from "./src/features/delivery/delivery.routes.js";
import categoryRoutes from "./src/features/category/category.routes.js";
import orderRoutes from "./src/features/automation/order.routes.js";
import userRoutes from "./src/features/user/user.routes.js";
import subscriptionPlanRoutes from "./src/features/subscription/subscriptionPlan.routes.js";
import notificationRoutes from "./src/features/notification/notification.routes.js";

import User from "./src/features/user/user.model.js";
import Subscription from "./src/features/subscription/subscription.model.js";
import Order from "./src/features/automation/order.model.js";
import Provider from "./src/features/provider/provider.model.js";

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

// Get local network IP to dynamically allow it
const getLocalIpAddress = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
};
const networkIp = getLocalIpAddress();

// ✅ FIXED CORS (Main Issue Solved Here)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow Postman / mobile apps

      const isNetworkIp = (networkIp && origin.startsWith(`http://${networkIp}:`)) || 
                          origin.match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+):\d+$/);

      if (allowedOrigins.includes(origin) || isNetworkIp) {
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
    origin: "*", // Allow all origins for debugging sockets
    methods: ["GET", "POST"],
    credentials: true,
  },
});
ioInstance = io;
initSubscriptionSocket(io);

let users = {};

app.set("io", io);
app.set("users", users);

io.on("connection", (socket) => {
  console.log("🔌 [SOCKET] New Connection:", socket.id);

  socket.on("registerUser", (userId) => {
    if (userId) {
      const userIdStr = userId.toString();
      users[userIdStr] = socket.id;
      console.log(`✅ [SOCKET] User ${userIdStr} mapped to socket ${socket.id}`);
    }
  });

  // Re-broadcast order status updates (Fallback mechanism)
  socket.on("updateOrderStatus", (data) => {
    console.log("📡 [SOCKET_REBROADCAST] Global update:", data);
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
app.use("/api/user", userRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);
app.use("/api/notifications", notificationRoutes);


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
    
    // Immediate Health Check & Sync on Startup
    const performStartupSync = async () => {
      try {
        const User = mongoose.model("User");
        const Subscription = mongoose.model("Subscription");
        const Order = mongoose.model("Order");
        const Provider = mongoose.model("Provider");

        const counts = {
          users: await User.countDocuments(),
          vendors: await Provider.countDocuments(),
          subscriptions: await Subscription.countDocuments({ status: "active" }),
          orders: await Order.countDocuments()
        };

        console.log("📊 [STARTUP] System Health Check:", counts);
        
        const { runDailyOrderCreation } = await import("./cron/subscriptionCron.js");
        console.log("⚙️ [STARTUP] Triggering immediate Order Creation Sync...");
        await runDailyOrderCreation();
        console.log("✅ [STARTUP] Sync complete.");
      } catch (err) {
        console.error("❌ [STARTUP] Error during health check/sync:", err.message);
      }
    };
    performStartupSync();
    
    // ✅ Start the Automation Engine (BullMQ Workers & Engine Cron)
    console.log("⚙️ Starting Automation Engine...");
    startAutomationEngine();
  })
  .catch((err) => console.log("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 8000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Backend Server is Live!`);
  console.log(`  ➜  Local:   http://localhost:${PORT}`);
  if (networkIp) {
    console.log(`  ➜  Network: http://${networkIp}:${PORT}`);
  }
  console.log();
});