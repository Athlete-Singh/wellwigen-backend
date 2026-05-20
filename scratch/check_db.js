import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import Provider from "../src/features/provider/provider.model.js";

async function checkDb() {
  try {
    console.log("Connecting to:", process.env.MONGO_URL);
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected successfully!");

    const providers = await Provider.find({});
    console.log(`Found ${providers.length} providers:`);
    providers.forEach(p => {
      console.log(`- ID: ${p._id}, Email: ${p.email}, BusinessName: ${p.businessName}, Type: ${p.type}, Status: ${p.verificationStatus}, isVerified: ${p.isVerified}`);
    });
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

checkDb();
