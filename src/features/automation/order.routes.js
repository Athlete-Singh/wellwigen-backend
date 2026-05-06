import express from "express";
import { getUserOrders, getVendorOrders, updateOrderStatus, triggerVendorNotification } from "./order.controller.js";

const router = express.Router();

// Trigger manual notification (Simulating Cron)
router.post("/trigger-vendor-notification", triggerVendorNotification);

// Fetch orders for a specific user
router.get("/user/:userId", getUserOrders);

// Fetch orders for a specific vendor
router.get("/vendor/:vendorId", getVendorOrders);

// Update order status
router.put("/:id/status", updateOrderStatus);

export default router;
