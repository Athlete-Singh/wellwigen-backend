import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./src/features/automation/order.model.js";

dotenv.config();

const checkOrders = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    const orders = await Order.find().populate("userId").limit(20);
    console.log(JSON.stringify(orders.map(o => ({
      id: o._id,
      customer: o.userId?.name || "Unknown",
      status: o.status,
      scheduledFor: o.scheduledFor,
      providerId: o.providerId
    })), null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};

checkOrders();
