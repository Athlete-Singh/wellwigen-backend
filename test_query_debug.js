import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./src/features/automation/order.model.js";

dotenv.config();

const testQuery = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    
    const vendorId = "demo-vendor-id"; // Simulate the dashboard's default ID
    
    console.log("🔍 Running query simulation...");
    
    // This is the EXACT logic from order.controller.js
    const query = {
      $or: [
        { providerId: vendorId },
        { status: "pending", providerId: null },
        { status: "pending", providerId: { $exists: false } }
      ],
      status: { $ne: "delivered" }
    };
    
    const orders = await Order.find(query).populate("userId");
    
    console.log(`✅ Query finished. Found ${orders.length} orders.`);
    
    if (orders.length > 0) {
      console.log("Samples:", orders.slice(0, 2).map(o => ({
          id: o._id,
          customer: o.userId?.name,
          status: o.status,
          date: o.scheduledFor
      })));
    } else {
        // Let's see if there are ANY orders at all
        const allCount = await Order.countDocuments();
        console.log(`📊 Total orders in DB (any status): ${allCount}`);
        
        const pendingCount = await Order.countDocuments({ status: "pending" });
        console.log(`📊 Pending orders in DB: ${pendingCount}`);
    }

  } catch (err) {
    console.error("❌ Error during test:", err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};

testQuery();
