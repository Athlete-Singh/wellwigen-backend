import express from "express";
import rateLimit from "express-rate-limit";
import { sendEmailOtp, verifyEmailOtp } from "./otp.controller.js";
import { providerAuthMiddleware } from "../../core/middleware/providerAuthMiddleware.js";

const router = express.Router();

// Strict IP rate limiter for OTP sending (Max 10 requests per 15 minutes per IP)
const sendOtpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP address. Please try again after 15 minutes.",
  },
});

// Strict IP rate limiter for OTP verification (Max 25 verification attempts per 15 minutes per IP)
const verifyOtpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts from this IP address. Please try again later.",
  },
});

// POST /api/otp/email/send
router.post(
  "/email/send",
  sendOtpIpLimiter,
  providerAuthMiddleware,
  sendEmailOtp
);

// POST /api/otp/email/verify
router.post(
  "/email/verify",
  verifyOtpIpLimiter,
  providerAuthMiddleware,
  verifyEmailOtp
);

export default router;
