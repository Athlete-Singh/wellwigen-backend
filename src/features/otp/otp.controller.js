import crypto from "crypto";
import { z } from "zod";
import Otp from "./otp.model.js";
import { sendVerificationEmail } from "../../core/services/emailService.js";

// Validation schema for email
const sendOtpSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email({ message: "Invalid email address format" }),
});

// Validation schema for OTP verify
const verifyOtpSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email({ message: "Invalid email address format" }),
  otp: z
    .string({ required_error: "OTP is required" })
    .trim()
    .regex(/^\d{6}$/, { message: "OTP must be a 6-digit number" }),
});

// Helper to calculate HMAC-SHA256 hash of OTP
const hashOtp = (otp) => {
  const secret = process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET || "wellwigen_default_hmac_secret_key";
  return crypto.createHmac("sha256", secret).update(otp).digest("hex");
};

/**
 * POST /api/otp/email/send
 * Sends a 6-digit OTP to the provider's email.
 * Requires Provider authentication.
 */
export const sendEmailOtp = async (req, res) => {
  try {
    const parseResult = sendOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || "Invalid email address",
      });
    }

    const { email } = parseResult.data;
    const provider = req.provider;

    // If provider was previously verified with a different email, reset verification
    if (provider.email && provider.email.toLowerCase() !== email && provider.emailVerified) {
      provider.emailVerified = false;
      provider.emailVerifiedAt = null;
      await provider.save();
    }

    // 1. Resend Cooldown Check (30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const recentOtp = await Otp.findOne({
      identifier: email,
      providerId: provider._id,
      consumed: false,
      createdAt: { $gte: thirtySecondsAgo },
    }).sort({ createdAt: -1 });

    if (recentOtp) {
      const waitSeconds = Math.max(
        1,
        Math.ceil((recentOtp.createdAt.getTime() + 30 * 1000 - Date.now()) / 1000)
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} second(s) before requesting a new verification code.`,
        retryAfter: waitSeconds,
      });
    }

    // 2. Email Rate Limit: Max 3 OTPs per email per 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await Otp.countDocuments({
      identifier: email,
      createdAt: { $gte: tenMinutesAgo },
    });

    if (recentCount >= 3) {
      return res.status(429).json({
        success: false,
        message: "Too many verification requests for this email. Please try again after 10 minutes.",
      });
    }

    // 3. Invalidate any previous unconsumed active OTPs for this provider & email
    await Otp.updateMany(
      { identifier: email, providerId: provider._id, consumed: false },
      { $set: { consumed: true } }
    );

    // 4. Cryptographically secure 6-digit OTP generation (100000 - 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashOtp(otp);

    // 5. Store in DB with 5-minute expiry (TTL index auto-deletes on expiry)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await Otp.create({
      providerId: provider._id,
      identifier: email,
      otpHash,
      expiresAt,
      attempts: 0,
      consumed: false,
      createdAt: new Date(),
    });

    // 6. Send email via swappable emailService
    await sendVerificationEmail({ toEmail: email, otp });

    // 7. Security: NEVER return OTP in response. Only log in development for local testing.
    if (process.env.NODE_ENV === "development") {
      console.log(`\n======================================================`);
      console.log(`🔑 [DEV ONLY] Generated Email OTP for ${email}: ${otp}`);
      console.log(`======================================================\n`);
    }

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your email address.",
      cooldownSeconds: 30,
    });
  } catch (err) {
    console.error("❌ Send Email OTP Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send verification email. Please try again later.",
    });
  }
};

/**
 * POST /api/otp/email/verify
 * Verifies a 6-digit OTP against the stored HMAC hash.
 * Requires Provider authentication.
 */
export const verifyEmailOtp = async (req, res) => {
  try {
    const parseResult = verifyOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || "Invalid OTP or email",
      });
    }

    const { email, otp } = parseResult.data;
    const provider = req.provider;

    // Find the latest active unconsumed OTP document
    const otpDoc = await Otp.findOne({
      identifier: email,
      providerId: provider._id,
      consumed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired or is invalid. Please request a new code.",
      });
    }

    // Check attempts limit (Max 5 attempts allowed)
    if (otpDoc.attempts >= 5) {
      otpDoc.consumed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: "Too many failed attempts. This code has been invalidated. Please request a new code.",
      });
    }

    // Constant-time compare using crypto.timingSafeEqual
    const computedHash = hashOtp(otp);
    const computedBuffer = Buffer.from(computedHash, "hex");
    const storedBuffer = Buffer.from(otpDoc.otpHash, "hex");

    const isMatch =
      computedBuffer.length === storedBuffer.length &&
      crypto.timingSafeEqual(computedBuffer, storedBuffer);

    if (!isMatch) {
      otpDoc.attempts += 1;
      if (otpDoc.attempts >= 5) {
        otpDoc.consumed = true;
      }
      await otpDoc.save();

      const remainingAttempts = Math.max(0, 5 - otpDoc.attempts);
      return res.status(400).json({
        success: false,
        message:
          remainingAttempts > 0
            ? `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`
            : "Too many failed attempts. This code has been invalidated. Please request a new code.",
        remainingAttempts,
      });
    }

    // OTP verified successfully: mark consumed
    otpDoc.consumed = true;
    await otpDoc.save();

    // Invalidate any other pending OTPs for this identifier
    await Otp.updateMany(
      { identifier: email, providerId: provider._id, consumed: false },
      { $set: { consumed: true } }
    );

    // Update Provider document in MongoDB
    provider.email = email;
    provider.emailVerified = true;
    provider.emailVerifiedAt = new Date();
    await provider.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully.",
      emailVerified: true,
    });
  } catch (err) {
    console.error("❌ Verify Email OTP Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during verification.",
    });
  }
};
