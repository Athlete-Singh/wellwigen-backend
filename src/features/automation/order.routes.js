import express from "express";
import { getUserOrders, getVendorOrders, updateOrderStatus, triggerVendorNotification } from "./order.controller.js";

const router = express.Router();

// Trigger manual notification (Simulating Cron)
router.post("/trigger-vendor-notification", triggerVendorNotification);

// Fetch orders for a specific user
router.get("/user/:userId", getUserOrders);

// ✅ REAL-TIME vendor orders — matches exact delivery days per subscription plan
router.get("/vendor-live", async (req, res, next) => {
  try {
    const Order = (await import("./order.model.js")).default;
    const Subscription = (await import("../subscription/subscription.model.js")).default;

    // Delivery schedule per plan (matches User Dashboard logic)
    const planDeliveryDays = {
      fit_start: [2, 5],       // Silver: Tuesday(2), Friday(5)
      healthy_life: [1, 3, 5], // Gold: Mon(1), Wed(3), Fri(5)
      total_wellness: [0, 1, 2, 3, 4, 5, 6], // Platinum: Daily
    };

    // Get next N upcoming delivery dates for a plan starting from today
    const getUpcomingDates = (plan, daysAhead = 30) => {
      const deliveryDays = planDeliveryDays[plan] || [2, 5]; // default to Silver
      const dates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i <= daysAhead; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        if (deliveryDays.includes(d.getDay())) {
          const slot = new Date(d);
          slot.setHours(8, 0, 0, 0); // 8 AM delivery
          dates.push(slot);
        }
        if (dates.length >= 7) break; // max 7 upcoming dates
      }
      return dates;
    };

    // Step 1: Find ALL subscriptions (real-time, no date filter)
    const activeSubs = await Subscription.find({
      status: { $in: ["active", "Active", "pending", "Pending"] }
    }).populate("userId", "name email phone");

    console.log(`🔄 [VENDOR-LIVE] Found ${activeSubs.length} subscriptions`);

    let created = 0;

    // Step 2: For each subscription, ensure orders exist for each upcoming delivery date
    for (const sub of activeSubs) {
      const userId = sub.userId?._id || sub.userId;
      const upcomingDates = getUpcomingDates(sub.plan);

      for (const deliveryDate of upcomingDates) {
        const dayStart = new Date(deliveryDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(deliveryDate); dayEnd.setHours(23, 59, 59, 999);

        const existing = await Order.findOne({
          userId,
          subscriptionId: sub._id,
          scheduledFor: { $gte: dayStart, $lte: dayEnd }
        });

        if (!existing) {
          await Order.create({
            userId,
            subscriptionId: sub._id,
            scheduledFor: deliveryDate,
            status: "pending",
            type: "produce",
            items: [{ name: sub.plan === 'fit_start' ? 'Fresh Seasonal Box' :
                           sub.plan === 'healthy_life' ? 'Extended Variety Box' :
                           'Premium Organic Box', quantity: 1 }]
          });
          created++;
          console.log(`✅ [VENDOR-LIVE] Order for ${sub.userId?.name || userId} on ${deliveryDate.toDateString()}`);
        }
      }
    }

    // Step 3: Return ALL non-delivered orders sorted by scheduled date
    const orders = await Order.find({ status: { $ne: "delivered" } })
      .populate("userId", "name phone email")
      .sort({ scheduledFor: 1 });

    console.log(`📦 [VENDOR-LIVE] Returning ${orders.length} orders (${created} newly created)`);
    res.json({ success: true, orders, created });
  } catch (err) {
    console.error("[VENDOR-LIVE] Error:", err.message);
    next(err);
  }
});

// Fetch orders for a specific vendor
router.get("/vendor/:vendorId", getVendorOrders);

// Update order status
router.put("/:id/status", updateOrderStatus);

// Debug: setup test data
router.get("/debug/setup-test-data", async (req, res, next) => {
  try {
    const { setupDemoData } = await import("./order.controller.js");
    await setupDemoData(req, res);
  } catch (err) {
    next(err);
  }
});

// Debug: system state snapshot
router.get("/debug/system-state", async (req, res, next) => {
  try {
    const { getSystemState } = await import("./order.controller.js");
    await getSystemState(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;
