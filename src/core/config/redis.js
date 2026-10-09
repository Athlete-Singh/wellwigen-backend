import { Redis } from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Check if using secure Redis (rediss://)
const isSecure = redisUrl.startsWith("rediss://");

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 2) return null; // Stop retrying if local Redis is down
    return 1000;
  },
  tls: isSecure ? {} : undefined, // Enable TLS only for cloud (rediss)
});

connection.on("connect", () => {
  console.log("✅ Redis Connected");
});

connection.on("error", (err) => {
  console.error("❌ Redis Error (continuing without Redis):", err.message);
});

// Suppress unhandled rejection crashes from Redis
connection.on("end", () => {
  console.log("⚠️ Redis Connection Ended");
});

export default connection;
