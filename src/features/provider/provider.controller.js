import Provider from "./provider.model.js";
import User from "../user/user.model.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendProviderApprovalEmail } from "../../core/utils/email.js";
import { ioInstance } from "../../../server.js";
import { sendPushNotification } from "../../core/utils/firebase.js";

// Step 1: Initialize/Update Provider Progress
export const saveProgress = async (req, res, next) => {
  try {
    const { phone, providerId, _id, ...progressData } = req.body;

    // Security: Strip any client-tampered flags
    delete progressData.emailVerified;
    delete progressData.emailVerifiedAt;
    delete progressData.isVerified;

    let provider = null;

    // 1. Try finding by authenticated provider session or ID
    if (req.provider) {
      provider = req.provider;
    } else if (providerId) {
      provider = await Provider.findById(providerId);
    }
    if (!provider && phone && phone.trim() !== "") {
      provider = await Provider.findOne({ phone: phone.trim() });
    }

    // Email change detection: If email changes after verification, reset emailVerified
    if (progressData.email && typeof progressData.email === "string") {
      const normalizedEmail = progressData.email.trim().toLowerCase();
      progressData.email = normalizedEmail;

      if (provider && provider.email && provider.email.toLowerCase() !== normalizedEmail && provider.emailVerified) {
        provider.emailVerified = false;
        provider.emailVerifiedAt = null;
      }
    }

    if (provider) {
      // Update existing draft
      Object.assign(provider, progressData);
      if (phone) provider.phone = phone.trim();
      await provider.save();
    } else {
      // Create new draft
      const newProviderData = {
        ...progressData,
        verificationStatus: "pending",
        isVerified: false,
        emailVerified: false,
      };
      if (phone && phone.trim() !== "") newProviderData.phone = phone.trim();

      provider = new Provider(newProviderData);
      await provider.save();
    }

    // Issue/renew onboarding session JWT token
    const token = jwt.sign(
      { id: provider._id, type: provider.type || "VENDOR", role: "provider_onboarding" },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Progress saved",
      data: provider,
      token,
    });
  } catch (err) {
    console.error("Save Progress Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Final application submission / registration
export const registerProvider = async (req, res, next) => {
  try {
    const { phone, providerId, _id, ...finalData } = req.body;

    // Security: Ignore client-provided verification & progress overrides
    delete finalData.emailVerified;
    delete finalData.emailVerifiedAt;
    delete finalData.isVerified;
    delete finalData.onboardingStep;

    let provider = null;
    if (req.provider) {
      provider = req.provider;
    } else if (providerId) {
      provider = await Provider.findById(providerId);
    }
    if (!provider && phone && phone.trim() !== "") {
      provider = await Provider.findOne({ phone: phone.trim() });
    }

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider application draft not found. Please complete the initial onboarding steps.",
      });
    }

    // Server-side verification enforcement: Check database flag directly
    if (!provider.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Email verification is required before submitting your application. Please verify your email.",
      });
    }

    // Detect if client attempted to submit a different email than the verified one
    if (finalData.email && typeof finalData.email === "string") {
      const submittedEmail = finalData.email.trim().toLowerCase();
      if (provider.email && provider.email.toLowerCase() !== submittedEmail) {
        provider.emailVerified = false;
        provider.emailVerifiedAt = null;
        await provider.save();
        return res.status(403).json({
          success: false,
          message: "Email mismatch detected. Your verification has been reset. Please verify your new email address.",
        });
      }
    }

    // Apply submitted data
    Object.assign(provider, finalData);
    if (phone) provider.phone = phone.trim();
    provider.onboardingStep = 7;
    provider.verificationStatus = "under_review";

    await provider.save();

    // 🔔 Push Notification: New Provider Registration (Admin Side)
    try {
      const admins = await User.find({ role: "admin" });
      const adminTokens = admins.flatMap((a) => a.fcmTokens || []);
      const adminIds = admins.map((a) => a._id.toString());
      if (adminTokens.length > 0) {
        await sendPushNotification(
          adminTokens,
          "📝 New Provider Registration",
          `A new provider (${provider.businessName || provider.email}) has registered and is pending approval.`,
          { type: "new_provider_registration", providerId: provider._id.toString() },
          { saveToDb: true, recipientIds: adminIds, role: "admin" }
        );
      }
    } catch (err) {
      console.error("⚠️ [PUSH] Failed to send new provider notification to admins:", err.message);
    }

    res.status(201).json({
      success: true,
      message: "Application submitted for review",
      data: provider,
    });
  } catch (err) {
    next(err);
  }
};

// Upload documents with server-side validation
export const uploadDocuments = async (req, res, next) => {
  try {
    const providerId = req.provider?._id || req.body.providerId;

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ success: false, message: "Provider not found" });

    // Handle files uploaded via multer
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const { verifyFileMagicBytes } = await import("../../core/middleware/uploadMiddleware.js");
      const newDocs = [];

      for (const file of req.files) {
        // Validate magic bytes on server disk
        const isValidMagic = verifyFileMagicBytes(file.path);
        if (!isValidMagic) {
          // Remove invalid file
          import("fs").then((fs) => fs.unlink(file.path, () => {})).catch(() => {});
          return res.status(400).json({
            success: false,
            message: `Security validation failed: File "${file.originalname}" does not match its claimed file type signature.`,
          });
        }

        newDocs.push({
          docType: req.body.docType || "Registration Document",
          fileUrl: `/uploads/${file.filename}`,
          verified: false,
        });
      }

      provider.documents = [...provider.documents, ...newDocs];
    } else if (req.body.documents && Array.isArray(req.body.documents)) {
      provider.documents = [...provider.documents, ...req.body.documents];
    }

    provider.verificationStatus = "under_review";
    await provider.save();

    res.status(200).json({
      success: true,
      message: "Documents uploaded, application is under review",
      data: provider,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyProfile = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ success: false, message: "Provider not found" });

    res.status(200).json({ success: true, data: provider });
  } catch (err) {
    next(err);
  }
};

export const updateAvailability = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    const { isActive, operatingHours, capacityLimit } = req.body;

    const provider = await Provider.findByIdAndUpdate(
      providerId,
      { $set: { isActive, operatingHours, capacityLimit } },
      { new: true }
    );

    res.status(200).json({ success: true, message: "Availability updated", data: provider });
  } catch (err) {
    next(err);
  }
};

// ================= ADMIN ACTIONS =================

// Get all pending provider applications
export const getPendingProviders = async (req, res, next) => {
  try {
    const providers = await Provider.find({ 
      verificationStatus: { $in: ["pending", "under_review"] } 
    }).sort("-createdAt");
    res.status(200).json({ success: true, data: providers });
  } catch (err) {
    next(err);
  }
};

// Get all approved/active provider applications
export const getApprovedProviders = async (req, res, next) => {
  try {
    console.log("🔍 FETCHING_APPROVED_PROVIDERS...");
    const providers = await Provider.find({ verificationStatus: "approved" }).sort("-createdAt");
    console.log(`✅ FOUND_${providers.length}_APPROVED_PROVIDERS`);
    res.status(200).json({ success: true, data: providers });
  } catch (err) {
    console.error("❌ GET_APPROVED_ERROR:", err);
    next(err);
  }
};

// Get all providers (regardless of status)
export const getAllProviders = async (req, res, next) => {
  try {
    const providers = await Provider.find().sort("-createdAt");
    res.status(200).json({ success: true, data: providers });
  } catch (err) {
    next(err);
  }
};

// Delete a provider permanently
export const deleteProvider = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    console.log(`🗑️ DELETING_PROVIDER: ${providerId}`);

    const provider = await Provider.findByIdAndDelete(providerId);
    if (!provider) {
      console.log(`❌ PROVIDER_NOT_FOUND: ${providerId}`);
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    console.log(`✅ PROVIDER_DELETED: ${provider.businessName}`);
    res.status(200).json({
      success: true,
      message: "Provider removed successfully"
    });
  } catch (err) {
    console.error("❌ DELETE_ERROR:", err);
    next(err);
  }
};

// Verify/Approve a provider
export const verifyProvider = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'
    console.log(`📝 VERIFYING_PROVIDER: ${providerId} to status: ${status}`);

    const provider = await Provider.findById(providerId);
    if (!provider) {
      console.log(`❌ PROVIDER_NOT_FOUND: ${providerId}`);
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    let cleartextPassword = "";
    if (status === 'approved') {
      // Generate a secure 8-character password with letters, numbers, and symbols
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
      for (let i = 0; i < 8; i++) {
        cleartextPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      const salt = await bcrypt.genSalt(10);
      provider.passwordHash = await bcrypt.hash(cleartextPassword, salt);
      console.log(`🔑 [VERIFY] Generated temp password for ${provider.email || provider.businessName}: ${cleartextPassword}`);
    }

    provider.verificationStatus = status;
    provider.isVerified = status === 'approved';
    provider.isActive = status === 'approved';

    await provider.save();
    console.log(`✅ PROVIDER_UPDATED: ${provider.businessName} is now ${status}`);

    if (ioInstance) {
      ioInstance.emit("providerStatusUpdated", { providerId, status });
      console.log(`📡 Emitted providerStatusUpdated socket event for ${providerId}`);
    }

    // Send email asynchronously if approved
    if (status === 'approved' && provider.email) {
      console.log(`📧 [VERIFY] Triggering credentials email to: ${provider.email}`);
      sendProviderApprovalEmail(
        provider.email,
        cleartextPassword,
        provider.type || "VENDOR",
        provider.businessName || provider.ownerName || "Wellwigen Partner"
      ).catch((mailErr) => {
        console.error("❌ [VERIFY] Failed to send approval email:", mailErr);
      });
    }

    // 🔔 Push Notification: Doctor/Provider Approved
    if (provider.fcmTokens && provider.fcmTokens.length > 0) {
      const notifTitle = status === 'approved'
        ? '✅ Account Approved!'
        : '❌ Application Update';
      const notifBody = status === 'approved'
        ? `Congratulations! Your Wellwigen ${provider.type || 'Provider'} account has been approved. You can now log in and start serving patients.`
        : `Your application status has been updated to: ${status}. Please contact support for more information.`;
      sendPushNotification(
        provider.fcmTokens,
        notifTitle,
        notifBody,
        { type: 'doctor_approved', status, providerId: providerId.toString() },
        { saveToDb: true, recipientId: providerId.toString(), role: 'provider' }
      ).then(() => {
        console.log(`🔔 [PUSH] Doctor approved notification sent to provider ${providerId}`);
      }).catch((pushErr) => {
        console.error('⚠️ [PUSH] Failed to send doctor approved notification:', pushErr.message);
      });
    }

    res.status(200).json({
      success: true,
      message: `Provider ${status} successfully`,
      data: provider
    });
  } catch (err) {
    console.error("❌ VERIFY_ERROR:", err);
    next(err);
  }
};

// Provider Login
export const loginProvider = async (req, res, next) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    email = email.trim().toLowerCase();
    
    let provider = await Provider.findOne({ email });
    let isLegacyVendor = false;

    if (!provider) {
      try {
        const VendorModel = mongoose.models.Vendor || (await import("../vendor/vendor.model.js")).default;
        provider = await VendorModel.findOne({ email });
        if (provider) {
          isLegacyVendor = true;
        }
      } catch (err) {
        console.error(`Error importing Vendor model:`, err.message);
      }
    }

    if (!provider) {
      return res.status(401).json({ success: false, message: "Invalid credentials: No account found." });
    }

    const status = isLegacyVendor ? (provider.status || "approved") : (provider.verificationStatus || "approved");

    if (status !== "approved") {
      return res.status(403).json({ 
        success: false, 
        message: `Your account is currently in ${status.toUpperCase()} status. Only approved accounts can log in.` 
      });
    }

    // VERIFY PASSWORD CRYPTOGRAPHICALLY
    if (provider.passwordHash) {
      const isMatch = await bcrypt.compare(password, provider.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Invalid credentials: The password you entered is incorrect." });
      }
    } else {
      return res.status(401).json({ success: false, message: "Password not set. Please contact support to set up your password." });
    }

    // ENFORCE ROLE/PORTAL ALIGNMENT IF EXPECTED ROLE SPECIFIED
    const providerRole = (provider.type || "VENDOR").toUpperCase();
    if (req.body.expectedRole && req.body.expectedRole.toUpperCase() !== providerRole) {
      console.log(`[LOGIN] Role mismatch: Portal expected ${req.body.expectedRole}, user is ${providerRole}`);
      return res.status(403).json({
        success: false,
        message: `Access Denied: You are registered as a ${providerRole} and cannot sign in through the ${req.body.expectedRole} portal.`
      });
    }
    
    const token = jwt.sign(
      { id: provider._id, type: provider.type || "VENDOR" },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      provider: {
        id: provider._id,
        ownerName: provider.ownerName || provider.name,
        email: provider.email,
        businessName: provider.businessName || provider.storeName,
        verificationStatus: status,
        type: provider.type || "VENDOR",
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
