import express from "express";
import {
  createSubscription,
  verifyPayment,
  getMySubscription,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  activateSubscriptionDirect,
  createAndActivateSubscription
} from "./subscription.controller.js";

const router = express.Router();

// Standard routes
router.post("/create", createSubscription);
router.post("/verify", verifyPayment);
router.get("/me/:userId", getMySubscription);
router.get("/all/:userId", getSubscription);
router.post("/cancel/:subscriptionId", cancelSubscription);
router.post("/pause/:subscriptionId", pauseSubscription);

// ✅ Real-time testing routes (no Razorpay needed)
router.post("/activate/:subscriptionId", activateSubscriptionDirect);
router.post("/create-active", createAndActivateSubscription);

export default router;
