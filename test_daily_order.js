import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import { runDailyOrderCreation } from "./cron/subscriptionCron.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const testDailyOrder = async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    console.log("✅ MongoDB Connected.\n");

   
    console.log("▶️ Running Daily Order Creation Logic");

    await runDailyOrderCreation();

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    console.log("\n🛑 Disconnecting from DB...");
    await mongoose.disconnect();
    console.log("✅ Exiting.");
    process.exit(0);
  }
};

testDailyOrder();
