import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import Subscription from "./src/features/subscription/subscription.model.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const createExpiringSub = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    
    const dummyUserId = new mongoose.Types.ObjectId();
    const expiry = new Date();
    
    // Set to expire in 4 minutes
    expiry.setMinutes(expiry.getMinutes() + 4);

    const sub = new Subscription({
      userId: dummyUserId,
      plan: "total_wellness",
      price: 1999,
      billingCycle: "monthly",
      status: "active",
      startDate: new Date(),
      endDate: expiry,
      razorpaySubscriptionId: "sub_test_" + Date.now()
    });

    await sub.save();
    console.log("✅ Created active subscription that will expire at:", expiry.toLocaleTimeString());
  } catch(e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};

createExpiringSub();
