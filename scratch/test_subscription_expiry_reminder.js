import assert from "assert";
import { getTargetExpiryWindowKolkata, processSubscriptionRenewalReminders } from "../src/core/jobs/reminderJobs.js";

console.log("🧪 =========================================================");
console.log("🧪 WELLWIGEN SUBSCRIPTION EXPIRY REMINDER VERIFICATION SUITE");
console.log("🧪 =========================================================\n");

// ============================================================
// TEST 1: Date Window Calculation in Asia/Kolkata
// ============================================================
console.log("▶️ TEST 1: Testing getTargetExpiryWindowKolkata boundaries & rollovers...");

// 1.1 Standard day (Oct 15 -> Oct 18)
const ref1 = new Date("2026-10-15T10:00:00.000+05:30");
const window1 = getTargetExpiryWindowKolkata(ref1, 3);
assert.strictEqual(window1.targetDateStr, "2026-10-18", "Target date string should be 2026-10-18");
assert.strictEqual(window1.startOfTarget.toISOString(), "2026-10-17T18:30:00.000Z", "Start in UTC must match 00:00 IST");
assert.strictEqual(window1.endOfTarget.toISOString(), "2026-10-18T18:29:59.999Z", "End in UTC must match 23:59:59.999 IST");
console.log("  ✅ Oct 15 -> Oct 18 window verified.");

// 1.2 Month rollover (Oct 30 -> Nov 2)
const ref2 = new Date("2026-10-30T10:00:00.000+05:30");
const window2 = getTargetExpiryWindowKolkata(ref2, 3);
assert.strictEqual(window2.targetDateStr, "2026-11-02", "Month rollover should reach 2026-11-02");
assert.strictEqual(window2.startOfTarget.toISOString(), "2026-11-01T18:30:00.000Z");
assert.strictEqual(window2.endOfTarget.toISOString(), "2026-11-02T18:29:59.999Z");
console.log("  ✅ Month rollover (Oct 30 -> Nov 02) verified.");

// 1.3 Year rollover (Dec 30 -> Jan 2)
const ref3 = new Date("2026-12-30T10:00:00.000+05:30");
const window3 = getTargetExpiryWindowKolkata(ref3, 3);
assert.strictEqual(window3.targetDateStr, "2027-01-02", "Year rollover should reach 2027-01-02");
assert.strictEqual(window3.startOfTarget.toISOString(), "2027-01-01T18:30:00.000Z");
assert.strictEqual(window3.endOfTarget.toISOString(), "2027-01-02T18:29:59.999Z");
console.log("  ✅ Year rollover (Dec 30 -> Jan 02) verified.");

// ============================================================
// TEST 2: Strict Day Filtering (2-day, 3-day, 4-day)
// ============================================================
console.log("\n▶️ TEST 2: Testing Strict 3-Calendar-Day Selection vs 2 & 4 Days...");

// Target window is Oct 18
const testStart = window1.startOfTarget;
const testEnd = window1.endOfTarget;

const sub2Days = new Date("2026-10-17T12:00:00.000+05:30"); // 2 days away
const sub3DaysMorning = new Date("2026-10-18T00:05:00.000+05:30"); // 3 days away early morning
const sub3DaysNoon = new Date("2026-10-18T14:30:00.000+05:30"); // 3 days away afternoon
const sub3DaysNight = new Date("2026-10-18T23:55:00.000+05:30"); // 3 days away late night
const sub4Days = new Date("2026-10-19T12:00:00.000+05:30"); // 4 days away

assert.strictEqual(sub2Days >= testStart && sub2Days <= testEnd, false, "2-day sub must NOT be in window");
assert.strictEqual(sub3DaysMorning >= testStart && sub3DaysMorning <= testEnd, true, "3-day morning sub MUST be in window");
assert.strictEqual(sub3DaysNoon >= testStart && sub3DaysNoon <= testEnd, true, "3-day noon sub MUST be in window");
assert.strictEqual(sub3DaysNight >= testStart && sub3DaysNight <= testEnd, true, "3-day night sub MUST be in window");
assert.strictEqual(sub4Days >= testStart && sub4Days <= testEnd, false, "4-day sub must NOT be in window");
console.log("  ✅ 2-day sub correctly excluded.");
console.log("  ✅ 3-day morning, noon, and night subs correctly included.");
console.log("  ✅ 4-day sub correctly excluded.");

// ============================================================
// TEST 3: Multi-Duration Handling (Monthly, Quarterly, Annual)
// ============================================================
console.log("\n▶️ TEST 3: Testing Multi-Duration Handling via stored endDate...");

const monthlyEndDate = new Date("2026-10-18T18:00:00.000+05:30");
const quarterlyEndDate = new Date("2026-10-18T11:00:00.000+05:30");
const annualEndDate = new Date("2026-10-18T09:15:00.000+05:30");

const dummyPlans = [
  { plan: "Monthly Basic", billingCycle: "monthly", endDate: monthlyEndDate },
  { plan: "Quarterly Pro", billingCycle: "quarterly", endDate: quarterlyEndDate },
  { plan: "Annual Family Shield", billingCycle: "annual", endDate: annualEndDate },
  { plan: "Monthly Other Day", billingCycle: "monthly", endDate: new Date("2026-10-25T10:00:00.000+05:30") },
];

const eligiblePlans = dummyPlans.filter(p => p.endDate >= testStart && p.endDate <= testEnd);
assert.strictEqual(eligiblePlans.length, 3, "All 3 plans expiring on target day must match regardless of billingCycle");
assert.strictEqual(eligiblePlans.map(p => p.billingCycle).sort().join(","), "annual,monthly,quarterly");
console.log("  ✅ Stored endDate correctly drives selection for monthly, quarterly, and annual subscriptions.");

// ============================================================
// TEST 4: Email & Push Template & Safety
// ============================================================
console.log("\n▶️ TEST 4: Testing Email Content & Safe Formatting...");
import { sendSubscriptionExpiryEmail } from "../src/core/utils/email.js";

// Verify function signature and validation
const invalidEmailResult = await sendSubscriptionExpiryEmail({ toEmail: "not-an-email", expiryDate: new Date() });
assert.strictEqual(invalidEmailResult.success, false, "Should reject invalid email");
console.log("  ✅ Email address validation confirmed.");

console.log("\n🎉 ALL UNIT & LOGIC CHECKS PASSED SUCCESSFULLY!\n");
