import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import Subscription from "./src/features/subscription/subscription.model.js";
import { runSubscriptionExpiryCheck } from "./cron/subscriptionCron.js";

dotenv.config();

// Ensure DNS works for MongoDB SRV records
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const forceExpireAndTest = async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    console.log("✅ MongoDB Connected.\n");

    console.log("=========================================");
    console.log("🛠️ Step 1: Finding an active subscription to expire...");
    
    let sub = await Subscription.findOne({ status: "active" });

    if (!sub) {
      console.log("⚠️ No active subscription found! Creating a dummy one...");
      const dummyUserId = new mongoose.Types.ObjectId();
      sub = new Subscription({
        userId: dummyUserId,
        plan: "total_wellness",
        price: 1999,
        billingCycle: "monthly",
        status: "active",
        startDate: new Date(),
        endDate: new Date(), // We will modify this immediately
        razorpaySubscriptionId: "sub_dummy_" + Date.now()
      });
      await sub.save();
      console.log("✅ Dummy subscription created:", sub._id);
    } else {
      console.log("✅ Found active subscription:", sub._id);
    }

    // Force Expiry
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    
    sub.endDate = yesterday;
    await sub.save();
    console.log(`⏱️ Forced endDate to past (${yesterday.toDateString()}) for sub: ${sub._id}`);

    console.log("\n=========================================");
    console.log("▶️ Step 2: Running Expiry Cron Job Logic");
    console.log("=========================================");
    
    await runSubscriptionExpiryCheck();

    console.log("\n=========================================");
    console.log("🔍 Step 3: Verifying Data");
    
    const updatedSub = await Subscription.findById(sub._id);
    console.log(`Final Status in DB: ${updatedSub.status.toUpperCase()}`);
    
    if (updatedSub.status === "expired") {
      console.log("🎉 TEST PASSED! Subscription was correctly marked as expired.");
    } else {
      console.log("❌ TEST FAILED! Subscription status did not change.");
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    console.log("\n🛑 Disconnecting from DB...");
    await mongoose.disconnect();
    console.log("✅ Exiting.");
    process.exit(0);
  }
};

forceExpireAndTest();
