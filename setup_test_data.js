import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/features/user/user.model.js";
import Subscription from "./src/features/subscription/subscription.model.js";
import Order from "./src/features/automation/order.model.js";

dotenv.config();

const setup = async () => {
  try {
    console.log("⏳ Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    console.log("✅ Connected to DB");

    // 1. Create a Test User
    let user = await User.findOne({ email: "test_vendor@wellwigen.com" });
    if (!user) {
      user = await User.create({
        name: "Rajesh Kumar (Automated Test)",
        email: "test_vendor@wellwigen.com",
        password: "password123",
        role: "user"
      });
      console.log("✅ Created Test User");
    }

    // 2. Create an Active Subscription starting Today
    const today = new Date();
    today.setHours(0,0,0,0);
    const expiry = new Date(today);
    expiry.setDate(today.getDate() + 30);

    const sub = await Subscription.create({
      userId: user._id,
      plan: "total_wellness",
      price: 1999,
      billingCycle: "monthly",
      status: "active",
      startDate: today,
      endDate: expiry,
      razorpaySubscriptionId: "sub_test_" + Date.now()
    });
    console.log("✅ Created Active Subscription");

    // 3. Create 7 Days of Upcoming Orders
    for (let i = 0; i < 7; i++) {
      const scheduledDate = new Date(today);
      scheduledDate.setDate(today.getDate() + i);

      await Order.create({
        userId: user._id,
        subscriptionId: sub._id,
        scheduledFor: scheduledDate,
        status: "pending",
        type: "produce",
        items: [{ name: "Total Wellness Box", quantity: 1 }]
      });
    }
    console.log("✅ SUCCESS: Generated 7 Days of Upcoming Orders!");
    console.log("🚀 Refresh your Vendor Dashboard now to see them.");

  } catch (err) {
    console.error("❌ Setup failed:", err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};

setup();
