import express from "express"; // Route reload trigger
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
    const OrderService = (await import("./order.service.js")).default;

    // Trigger a global sync to ensure all active subscriptions have upcoming orders
    const syncResult = await OrderService.syncAllActiveOrders();

    // Return ALL non-delivered orders sorted by scheduled date
    const orders = await Order.find({ status: { $ne: "delivered" } })
      .populate("userId", "name phone email")
      .sort({ scheduledFor: 1 });

    console.log(`📦 [VENDOR-LIVE] Returning ${orders.length} orders (${syncResult.totalCreated} newly created)`);
    res.json({ success: true, orders, created: syncResult.totalCreated, syncResult });
  } catch (err) {
    console.error("[VENDOR-LIVE] Error:", err.message);
    next(err);
  }
});

// Fetch orders for a specific vendor
router.get("/vendor/:vendorId", getVendorOrders);

// Update order status
router.put("/:id/status", updateOrderStatus);

// Final Ignition Route
router.get("/ignite", async (req, res, next) => {
  try {
    const { igniteProduction } = await import("./order.controller.js");
    await igniteProduction(req, res);
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
