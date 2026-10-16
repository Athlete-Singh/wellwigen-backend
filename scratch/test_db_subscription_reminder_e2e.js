import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import assert from "assert";

import User from "../src/features/user/user.model.js";
import Subscription from "../src/features/subscription/subscription.model.js";
import Reminder from "../models/Reminders.js";
import { getTargetExpiryWindowKolkata, processSubscriptionRenewalReminders } from "../src/core/jobs/reminderJobs.js";

dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const runE2ETests = async () => {
  console.log("🚀 =========================================================");
  console.log("🚀 END-TO-END DATABASE SUBSCRIPTION REMINDER TEST SUITE");
  console.log("🚀 =========================================================\n");

  const mongoUri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wellwigen";
  await mongoose.connect(mongoUri, { dbName: "wellwigen" });
  console.log("✅ Connected to MongoDB for E2E testing.");

  const createdUserIds = [];
  const createdSubIds = [];
  const createdReminderIds = [];

  try {
    const today = new Date("2026-10-15T10:00:00.000+05:30");
    const { targetDateStr, startOfTarget, endOfTarget } = getTargetExpiryWindowKolkata(today, 3);
    console.log(`📅 Simulated reference date: Oct 15, 2026 IST -> Target expiry: ${targetDateStr}`);

    // Create Test User A (with email, without FCM tokens)
    const userA = await User.create({
      name: "E2E Test User Alpha",
      email: "test.subscriber.alpha@example.com",
      password: "hashed_dummy_password",
      role: "user",
      fcmTokens: [],
    });
    createdUserIds.push(userA._id);

    // Create Test User B (with email and simulated FCM token)
    const userB = await User.create({
      name: "E2E Test User Beta",
      email: "test.subscriber.beta@example.com",
      password: "hashed_dummy_password",
      role: "user",
      fcmTokens: ["fcm_dummy_token_beta_12345"],
    });
    createdUserIds.push(userB._id);

    // Sub 1: Exactly 3 days away (User A, Monthly)
    const expiryDate3DayA = new Date("2026-10-18T14:00:00.000+05:30");
    const sub1 = await Subscription.create({
      userId: userA._id.toString(),
      plan: "Monthly Health Plus",
      price: 1999,
      billingCycle: "monthly",
      status: "active",
      startDate: new Date("2026-09-18T14:00:00.000+05:30"),
      endDate: expiryDate3DayA,
    });
    createdSubIds.push(sub1._id);

    // Sub 2: Exactly 3 days away (User B, Annual)
    const expiryDate3DayB = new Date("2026-10-18T09:30:00.000+05:30");
    const sub2 = await Subscription.create({
      userId: userB._id.toString(),
      plan: "Annual Family Shield",
      price: 14999,
      billingCycle: "annual",
      status: "active",
      startDate: new Date("2025-10-18T09:30:00.000+05:30"),
      endDate: expiryDate3DayB,
    });
    createdSubIds.push(sub2._id);

    // Sub 3: 2 days away (Should NOT be notified)
    const expiryDate2Day = new Date("2026-10-17T12:00:00.000+05:30");
    const sub3 = await Subscription.create({
      userId: userA._id.toString(),
      plan: "2-Day Expiring Plan",
      price: 999,
      billingCycle: "monthly",
      status: "active",
      endDate: expiryDate2Day,
    });
    createdSubIds.push(sub3._id);

    // Sub 4: 4 days away (Should NOT be notified)
    const expiryDate4Day = new Date("2026-10-19T12:00:00.000+05:30");
    const sub4 = await Subscription.create({
      userId: userA._id.toString(),
      plan: "4-Day Expiring Plan",
      price: 999,
      billingCycle: "monthly",
      status: "active",
      endDate: expiryDate4Day,
    });
    createdSubIds.push(sub4._id);

    console.log("✅ Seeded test users and subscriptions.");

    // ============================================================
    // STEP 1: Process Reminders
    // ============================================================
    console.log("\n▶️ STEP 1: Running processSubscriptionRenewalReminders...");
    const run1 = await processSubscriptionRenewalReminders({ referenceDate: today });
    assert.strictEqual(run1.success, true);
    console.log("Run 1 Result:", run1.results);

    // Sub 1 verification: User A has no FCM tokens -> push skipped, email attempted/sent
    const refreshedSub1 = await Subscription.findById(sub1._id);
    assert.strictEqual(refreshedSub1.renewalReminder.pushStatus, "skipped", "User A without FCM tokens should have pushStatus 'skipped'");
    assert(
      refreshedSub1.renewalReminder.emailStatus === "sent" || refreshedSub1.renewalReminder.emailStatus === "failed",
      "Email status should be recorded"
    );
    assert.strictEqual(
      refreshedSub1.renewalReminder.targetEndDate.getTime(),
      expiryDate3DayA.getTime(),
      "targetEndDate must record the 3-day expiry date"
    );
    console.log("  ✅ Sub 1 (User without FCM): push skipped, email tracked, targetEndDate recorded.");

    // Sub 3 and 4 verification: must have NO renewalReminder set
    const refreshedSub3 = await Subscription.findById(sub3._id);
    const refreshedSub4 = await Subscription.findById(sub4._id);
    assert.strictEqual(refreshedSub3.renewalReminder?.targetEndDate, undefined, "2-day sub must NOT be processed");
    assert.strictEqual(refreshedSub4.renewalReminder?.targetEndDate, undefined, "4-day sub must NOT be processed");
    console.log("  ✅ 2-day and 4-day subscriptions completely untouched.");

    // ============================================================
    // STEP 2: Duplicate Prevention (Idempotency)
    // ============================================================
    console.log("\n▶️ STEP 2: Re-running processSubscriptionRenewalReminders (testing idempotency)...");
    const run2 = await processSubscriptionRenewalReminders({ referenceDate: today });
    assert.strictEqual(run2.success, true);
    console.log("Run 2 Result:", run2.results);
    assert.strictEqual(run2.results.emailSentCount, 0, "No duplicate emails should be sent on repeated run");
    assert.strictEqual(run2.results.pushSentCount, 0, "No duplicate push notifications should be sent on repeated run");
    console.log("  ✅ Duplicate prevention confirmed: 0 re-sent reminders.");

    // ============================================================
    // STEP 3: Subscription Renewal with New Expiry Date
    // ============================================================
    console.log("\n▶️ STEP 3: Simulating Subscription Renewal to Nov 18...");
    const renewedEndDate = new Date("2026-11-18T14:00:00.000+05:30");
    await Subscription.findByIdAndUpdate(sub1._id, { $set: { endDate: renewedEndDate } });

    // When date is advanced to 3 days before renewedEndDate (Nov 15)
    const renewedRefDate = new Date("2026-11-15T10:00:00.000+05:30");
    const run3 = await processSubscriptionRenewalReminders({ referenceDate: renewedRefDate });
    console.log("Run 3 (Renewed Term) Result:", run3.results);
    const refreshedRenewedSub1 = await Subscription.findById(sub1._id);
    assert.strictEqual(
      refreshedRenewedSub1.renewalReminder.targetEndDate.getTime(),
      renewedEndDate.getTime(),
      "Renewed subscription targetEndDate updated to new expiry date"
    );
    console.log("  ✅ Renewal support confirmed: new 3-day reminder processed for renewed term.");

    console.log("\n🎉 ALL DATABASE E2E VERIFICATIONS COMPLETED SUCCESSFULLY!");

  } catch (err) {
    console.error("❌ E2E Test Failure:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n🧹 Cleaning up test documents...");
    if (createdSubIds.length > 0) {
      await Subscription.deleteMany({ _id: { $in: createdSubIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await Reminder.deleteMany({
      email: { $in: ["test.subscriber.alpha@example.com", "test.subscriber.beta@example.com"] }
    });
    console.log("✅ Cleanup finished. Disconnecting.");
    await mongoose.disconnect();
  }
};

runE2ETests();
