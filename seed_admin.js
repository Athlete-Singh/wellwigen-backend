import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import bcrypt from "bcryptjs";
import Admin from "./src/features/admin/admin.model.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

export async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wellwigen";
    await mongoose.connect(mongoUri, { dbName: "wellwigen" });
    console.log("✅ MongoDB Connected for Admin Seeding");

    const adminPassword = (process.env.ADMIN_PASSWORD || "bodyfit@wwg").trim();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const adminsToSeed = [
      { username: (process.env.ADMIN_USERNAME || "wellwigen.gate").trim().toLowerCase() },
      { username: (process.env.ADMIN_EMAIL || "wellwigen@gmail.com").trim().toLowerCase() },
      { username: "wellwigen@gmail.com" },
      { username: "wellwigen.gate" },
    ];

    // Deduplicate usernames
    const uniqueUsernames = [...new Set(adminsToSeed.map(a => a.username))];

    console.log("\n🌱 Seeding Admin Accounts with password:", adminPassword);
    for (const username of uniqueUsernames) {
      const existing = await Admin.findOne({ username });
      if (!existing) {
        await Admin.create({
          username,
          password: hashedPassword,
        });
        console.log(`  ➕ Created Admin: [${username}] with password: [${adminPassword}]`);
      } else {
        existing.password = hashedPassword;
        await existing.save();
        console.log(`  🔄 Updated Admin: [${username}] password reset to: [${adminPassword}]`);
      }
    }

    console.log("\n🎉 Admin seeding successfully completed!\n");
  } catch (err) {
    console.error("❌ Admin seeding error:", err);
  }
}

// Run directly if invoked from command line
if (process.argv[1]?.endsWith("seed_admin.js")) {
  seedAdmin().then(() => process.exit(0)).catch(() => process.exit(1));
}
