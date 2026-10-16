import express from "express";
import rateLimit from "express-rate-limit";
import {
  adminLogin,
  verifyAdmin,
  deleteSubscriber,
  deleteSubscription,
  updateSubscription,
} from "./admin.controller.js";

const router = express.Router();

// Brute-force protection:
// Only count failed attempts (skipSuccessfulRequests: true) and set reasonable quota
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Security Alert: Too many failed login attempts. Temporarily locked for 15 minutes.",
  },
});


router.post("/login", adminLoginLimiter, adminLogin);
router.get("/verify", verifyAdmin);

// Subscriber & Membership Management Routes
router.delete("/subscribers/:id", deleteSubscriber);
router.delete("/subscriptions/:id", deleteSubscription);
router.patch("/subscriptions/:id", updateSubscription);

export default router;

