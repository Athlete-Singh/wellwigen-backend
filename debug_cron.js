import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import Subscription from "./src/features/subscription/subscription.model.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const checkCronLive = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    
    console.log("=== Checking current subscriptions in DB ===");
    const subs = await Subscription.find({});
    console.log(`Found ${subs.length} total subscriptions.`);
    const active = subs.filter(s => s.status === 'active');
    console.log(`Active: ${active.length}`);
    
    const now = new Date();
    console.log("Current Time:", now);

    active.forEach(s => {
      const msLeft = new Date(s.endDate).getTime() - now.getTime();
      const minsLeft = (msLeft / 1000 / 60).toFixed(2);
      console.log(`- Sub: ${s._id}, EndDate: ${new Date(s.endDate)}, Mins Left: ${minsLeft}`);
    });

  } catch(e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};
checkCronLive();
