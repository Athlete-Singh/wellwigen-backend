import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import Subscription from "./src/features/subscription/subscription.model.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const checkSubs = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    const subs = await Subscription.find({});
    console.log("Total Subscriptions:", subs.length);
    console.log("Active Subscriptions:", subs.filter(s => s.status === 'active').length);
    subs.filter(s => s.status === 'active').forEach(s => {
      console.log(`- Sub: ${s._id}, User: ${s.userId}, EndDate: ${s.endDate}, Now: ${new Date()}`);
    });
  } catch(e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};
checkSubs();
