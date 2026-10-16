import mongoose from "mongoose";
import Trainer from "./trainer.model.js";
import Notification from "../notification/notification.model.js";
import nodemailer from "nodemailer";

// Helper to notify Admin when a new trainer submits application requiring approval
const sendAdminTrainerAlert = async (trainer, applicationId) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log("ℹ️ [ADMIN_ALERT] SMTP not configured; notification logged to DB and socket.");
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const portalUrl = process.env.FRONTEND_URL 
      ? `${process.env.FRONTEND_URL.split(",")[0]}/admin/panel`
      : "http://localhost:5177/admin/panel";

    await transporter.sendMail({
      from: `"Wellwigen Coach System" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `🚨 New Coach Application: ${trainer.name} (${applicationId}) - Needs Approval`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
          <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 800;">WELLWIGEN ADMIN ALERT</h2>
            <span style="font-size: 11px; font-weight: 700; color: #0d9488; text-transform: uppercase;">Coach Application &bull; Pending Approval</span>
          </div>
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 18px; border-radius: 12px; margin: 16px 0;">
            <h3 style="color: #b45309; margin: 0 0 6px 0; font-size: 16px;">Action Required: Coach Awaiting Approval</h3>
            <p style="color: #92400e; font-size: 14px; margin: 0;">
              <strong>${trainer.name}</strong> has submitted their credentials and is waiting for your review and approval.
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Coach Name:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 700;">${trainer.name}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Email:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${trainer.email}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Phone:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${trainer.phone || "Not provided"}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Specialization:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${trainer.specialization || "Fitness Coach"}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Application ID:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #0d9488; font-weight: 800; font-family: monospace;">${applicationId}</td>
            </tr>
          </table>
          <div style="margin: 24px 0;">
            <a href="${portalUrl}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px;">
              Open Admin Portal &rarr; Review &amp; Approve
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 14px; margin-top: 24px;">
            This is an automated administrative notification dispatched by Wellwigen Backend.
          </p>
        </div>
      `,
    });
    console.log(`✉️ [ADMIN_ALERT] Sent trainer application email alert to: ${adminEmail}`);
  } catch (err) {
    console.warn(`⚠️ [ADMIN_ALERT] Could not send admin email alert: ${err.message}`);
  }
};

// Helper to send email notification to trainer on status change
const sendStatusNotificationEmail = async (trainer, newStatus, rejectionReason) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log("ℹ️ [EMAIL] SMTP not configured, skipping trainer notification email.");
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const isApproved = newStatus === "approved";
    const subject = isApproved
      ? "🎉 Congratulations! Your Wellwigen Coach Profile is Approved"
      : "Update Regarding Your Wellwigen Coach Application";

    const bodyHtml = isApproved
      ? `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
          <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 800;">WELLWIGEN COACH HUB</h2>
            <span style="font-size: 11px; font-weight: 700; color: #0d9488; text-transform: uppercase;">Stronger Body. Better You.</span>
          </div>
          <p style="font-size: 15px; color: #334155;">Hi <strong>${trainer.name}</strong>,</p>
          <div style="background: #f0fdfa; border: 1px solid #99f6e4; padding: 18px; border-radius: 12px; margin: 20px 0;">
            <h3 style="color: #0f766e; margin: 0 0 8px 0; font-size: 16px;">✅ Verified Coach Profile Activated!</h3>
            <p style="color: #134e4a; font-size: 14px; line-height: 1.5; margin: 0;">
              Our athletic board has verified your certifications and approved your Wellwigen coach application. Your profile is now live!
            </p>
          </div>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">
            You can now log in to the Coach Portal, schedule live group classes, and start accepting 1-on-1 trainees.
          </p>
          <div style="margin: 24px 0;">
            <a href="http://localhost:5177/trainer/dashboard" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px;">
              Access Coach Dashboard
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
            Wellwigen Team &bull; support@wellwigen.com
          </p>
        </div>
      `
      : `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
          <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 800;">WELLWIGEN COACH HUB</h2>
            <span style="font-size: 11px; font-weight: 700; color: #0d9488; text-transform: uppercase;">Stronger Body. Better You.</span>
          </div>
          <p style="font-size: 15px; color: #334155;">Hi <strong>${trainer.name}</strong>,</p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 18px; border-radius: 12px; margin: 20px 0;">
            <h3 style="color: #991b1b; margin: 0 0 8px 0; font-size: 16px;">Application Status: Action Required</h3>
            <p style="color: #7f1d1d; font-size: 14px; line-height: 1.5; margin: 0;">
              Your trainer onboarding application could not be approved at this time.
            </p>
            <div style="margin-top: 12px; padding: 10px; background: #ffffff; border-radius: 8px; border-left: 3px solid #ef4444;">
              <strong style="font-size: 12px; color: #991b1b; text-transform: uppercase;">Reason provided:</strong>
              <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px;">${rejectionReason || "Credentials require further clarification."}</p>
            </div>
          </div>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">
            You can log into your portal to update your credentials and re-submit your application for expedited verification.
          </p>
          <div style="margin: 24px 0;">
            <a href="http://localhost:5177/trainer/onboarding" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px;">
              Update Application
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
            Wellwigen Verification Board &bull; support@wellwigen.com
          </p>
        </div>
      `;

    await transporter.sendMail({
      from: `"Wellwigen Verification Team" <${process.env.SMTP_USER}>`,
      to: trainer.email,
      subject,
      html: bodyHtml,
    });

    console.log(`✉️ [EMAIL] Status notification sent to trainer: ${trainer.email} (${newStatus})`);
  } catch (err) {
    console.warn(`⚠️ [EMAIL] Failed to send status notification email: ${err.message}`);
  }
};

// ================= ADMIN CONTROLLERS =================

// GET /api/admin/trainers
export const getAdminTrainers = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const query = {};

    if (status && status !== "All") {
      query.status = status;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { specialization: regex },
        { city: regex },
        { applicationId: regex },
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNum - 1) * limitNum;

    const [trainers, total, countPending, countApproved, countRejected] = await Promise.all([
      Trainer.find(query)
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Trainer.countDocuments(query),
      Trainer.countDocuments({ status: "pending" }),
      Trainer.countDocuments({ status: "approved" }),
      Trainer.countDocuments({ status: "rejected" }),
    ]);

    return res.json({
      success: true,
      trainers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
      counts: {
        total: countPending + countApproved + countRejected,
        pending: countPending,
        approved: countApproved,
        rejected: countRejected,
      },
    });
  } catch (err) {
    console.error("❌ [TRAINER_ADMIN] Error in getAdminTrainers:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch trainers",
      error: err.message,
    });
  }
};

// OLD CODE (commented by AI)
/*
export const getAdminTrainerById = async (req, res) => {
  try {
    const { id } = req.params;
    const trainer = await Trainer.findById(id).lean();
*/
// NEW CODE - Flexible ID query supporting both ObjectId and string ID
const findTrainerRecord = async (id) => {
  const queryConditions = [
    { _id: id },
    { id: id },
    { applicationId: id },
    { email: id },
  ];
  if (mongoose.Types.ObjectId.isValid(id) && typeof id === "string" && id.length === 24) {
    queryConditions.unshift({ _id: new mongoose.Types.ObjectId(id) });
  }
  return await Trainer.findOne({ $or: queryConditions });
};

export const getAdminTrainerById = async (req, res) => {
  try {
    const { id } = req.params;
    const queryConditions = [
      { _id: id },
      { id: id },
      { applicationId: id },
      { email: id },
    ];
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === "string" && id.length === 24) {
      queryConditions.unshift({ _id: new mongoose.Types.ObjectId(id) });
    }
    const trainer = await Trainer.findOne({ $or: queryConditions }).lean();

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    return res.json({
      success: true,
      trainer,
    });
  } catch (err) {
    console.error("❌ [TRAINER_ADMIN] Error in getAdminTrainerById:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch trainer details",
      error: err.message,
    });
  }
};

// PATCH /api/admin/trainers/:id/status
export const updateTrainerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Must be 'approved', 'rejected', or 'pending'.",
      });
    }

    if (status === "rejected" && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required when rejecting an application.",
      });
    }

    // OLD CODE (commented by AI)
    // const trainer = await Trainer.findById(id);
    // NEW CODE
    const trainer = await findTrainerRecord(id);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer application not found",
      });
    }

    trainer.status = status;
    if (status === "approved") {
      trainer.approvedAt = new Date();
      trainer.rejectionReason = "";
    } else if (status === "rejected") {
      trainer.rejectedAt = new Date();
      trainer.rejectionReason = rejectionReason.trim();
    }

    await trainer.save();

    // Trigger async email notification if status changed to approved or rejected
    sendStatusNotificationEmail(trainer, status, rejectionReason);

    return res.json({
      success: true,
      message: `Trainer application successfully ${status}!`,
      trainer,
    });
  } catch (err) {
    console.error("❌ [TRAINER_ADMIN] Error in updateTrainerStatus:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update trainer status",
      error: err.message,
    });
  }
};

// DELETE /api/admin/trainers/:id
export const deleteTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Trainer ID is required" });
    }

    const queryConditions = [
      { _id: id },
      { id: id },
      { applicationId: id },
      { email: id },
    ];
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === "string" && id.length === 24) {
      queryConditions.unshift({ _id: new mongoose.Types.ObjectId(id) });
    }

    const deleted = await Trainer.findOneAndDelete({ $or: queryConditions });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Trainer profile not found",
      });
    }

    console.log(`🗑️ [TRAINER_ADMIN] Deleted trainer: ${deleted.name} (${deleted.email})`);

    return res.json({
      success: true,
      message: `Coach ${deleted.name} has been permanently deleted from registry.`,
      trainer: deleted,
    });
  } catch (err) {
    console.error("❌ [TRAINER_ADMIN] Error in deleteTrainer:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete trainer profile",
      error: err.message,
    });
  }
};

// ================= PUBLIC / TRAINER CONTROLLERS =================

// GET /api/trainers/approved
export const getApprovedTrainers = async (req, res) => {
  try {
    const trainers = await Trainer.find({ status: "approved" })
      .select("name specialization experience city photoUrl rating reviewsCount bio services certifications languages")
      .sort({ rating: -1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      trainers,
    });
  } catch (err) {
    console.error("❌ [TRAINER_PUBLIC] Error in getApprovedTrainers:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load approved coaches",
      error: err.message,
    });
  }
};

// POST /api/trainers/register
export const registerTrainer = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and phone are required",
      });
    }

    let existing = await Trainer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A trainer account with this email already exists.",
      });
    }

    const trainer = new Trainer({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      status: "onboarding",
    });

    await trainer.save();

    return res.status(201).json({
      success: true,
      message: "Trainer registered successfully",
      trainer,
    });
  } catch (err) {
    console.error("❌ [TRAINER_AUTH] Error in registerTrainer:", err);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
      error: err.message,
    });
  }
};

// POST /api/trainers/submit-onboarding
export const submitOnboarding = async (req, res) => {
  try {
    const { email, _id, id: rawId, ...data } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Trainer email is required",
      });
    }

    const applicationId = "WW-TRN-" + Math.floor(100000 + Math.random() * 900000);

    const updated = await Trainer.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        ...data,
        status: "pending",
        applicationId,
        submittedAt: new Date(),
      },
      { new: true, upsert: true }
    );

    // 1. Create in-app Admin Notification in MongoDB
    try {
      await Notification.create({
        role: "admin",
        title: "New Coach Application Submitted",
        body: `${updated.name} has submitted their trainer onboarding application (${applicationId}) and is waiting for your review and approval.`,
        data: {
          trainerId: updated._id,
          trainerName: updated.name,
          trainerEmail: updated.email,
          applicationId,
          specialization: updated.specialization,
          type: "trainer_application",
        },
      });
    } catch (notifErr) {
      console.warn("⚠️ [NOTIFICATION] Error saving admin notification:", notifErr.message);
    }

    // 2. Real-time broadcast to Admin via Socket.io
    try {
      const io = req.app.get("io");
      if (io) {
        io.emit("newTrainerApplication", {
          trainer: updated,
          applicationId,
          message: `${updated.name} submitted their trainer application and wants approval.`,
        });
        io.emit("adminNotification", {
          title: "New Coach Application Submitted",
          body: `${updated.name} has submitted their trainer application and is waiting for your approval.`,
          data: {
            trainerId: updated._id,
            trainerName: updated.name,
            applicationId,
            type: "trainer_application",
          },
        });
      }
    } catch (socketErr) {
      console.warn("⚠️ [SOCKET] Socket notification broadcast notice:", socketErr.message);
    }

    // 3. Dispatch automated email alert to admin
    sendAdminTrainerAlert(updated, applicationId).catch(() => {});

    console.log(`📣 [TRAINER_SUBMISSION] Trainer ${updated.name} (${applicationId}) submitted application. Admin notified.`);

    return res.json({
      success: true,
      message: "Onboarding submitted successfully for review",
      trainer: updated,
    });
  } catch (err) {
    console.error("❌ [TRAINER_ONBOARDING] Error in submitOnboarding:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to submit onboarding",
      error: err.message,
    });
  }
};

// GET /api/trainers/status?email=...
export const getTrainerStatus = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email required" });
    }

    const trainer = await Trainer.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    return res.json({
      success: true,
      status: trainer.status,
      rejectionReason: trainer.rejectionReason || "",
      trainer,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// PATCH /api/trainers/profile
export const updateTrainerProfile = async (req, res) => {
  try {
    const { email, services, ...otherUpdates } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email required" });
    }

    const trainer = await Trainer.findOne({ email: email.toLowerCase().trim() });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    if (services) {
      trainer.services = {
        ...(trainer.services || {}),
        ...services,
      };
      trainer.markModified("services");
    }

    if (otherUpdates.payout) {
      trainer.payout = {
        ...(trainer.payout || {}),
        ...otherUpdates.payout,
      };
      trainer.markModified("payout");
    }

    Object.keys(otherUpdates).forEach((key) => {
      if (key !== "email" && key !== "_id" && key !== "payout") {
        trainer[key] = otherUpdates[key];
      }
    });

    await trainer.save();

    return res.json({
      success: true,
      trainer,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ================= ADMIN: ASSIGN COACH TO CLIENT OR GROUP =================
export const assignCoachToTarget = async (req, res) => {
  try {
    const {
      assignmentType = "client",
      targetId = "",
      targetName,
      targetEmail = "",
      targetPhone = "",
      targetGoal = "General Fitness",
      plan = "Personal Training",
      totalSessions = 12,
      coachName,
      coachId = "",
      coachEmail = "",
      coachPhone = "",
      adminNotes = "",
      assignedBy = "admin",
    } = req.body;

    if (!targetName) {
      return res.status(400).json({ success: false, message: "Target name is required." });
    }

    if (!coachName || coachName === "Unassigned") {
      return res.json({
        success: true,
        message: "Client status kept as Unassigned (No notification queued).",
      });
    }

    const { createCoachAssignment } = await import("../../core/jobs/assignmentCron.js");

    const assignment = await createCoachAssignment({
      assignmentType,
      targetId,
      targetName,
      targetEmail,
      targetPhone,
      targetGoal,
      plan,
      totalSessions,
      coachId,
      coachName,
      coachEmail,
      coachPhone,
      adminNotes,
      assignedBy,
    });

    return res.json({
      success: true,
      message: `Coach "${coachName}" successfully assigned to ${targetName}. Automated cron job will dispatch Panel, WhatsApp, and Email notifications!`,
      assignment,
    });
  } catch (error) {
    console.error("❌ [ASSIGN_COACH] Error assigning coach:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= TRAINER: GET ASSIGNMENTS & NOTIFICATIONS =================
export const getTrainerAssignments = async (req, res) => {
  try {
    const { email, coachId, name } = req.query;
    const CoachAssignment = (await import("./coachAssignment.model.js")).default;

    let query = {};
    if (coachId) {
      query.$or = [{ coachId }, { coachEmail: email?.toLowerCase() }, { coachName: name }];
    } else if (email) {
      query.$or = [{ coachEmail: email.toLowerCase() }, { coachName: name }];
    } else if (name) {
      query.coachName = new RegExp(`^${name.trim()}$`, "i");
    }

    let assignments = [];
    if (mongoose.connection.readyState === 1) {
      assignments = await CoachAssignment.find(query).sort({ createdAt: -1 }).limit(50);
    }

    return res.json({
      success: true,
      count: assignments.length,
      assignments,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ================= SYSTEM / ADMIN: MANUALLY TRIGGER ASSIGNMENT CRON =================
export const triggerCoachAssignmentCronManually = async (req, res) => {
  try {
    const { runCoachAssignmentCron } = await import("../../core/jobs/assignmentCron.js");
    const result = await runCoachAssignmentCron();
    return res.json({
      success: true,
      message: "Automated Coach Assignment Cron executed successfully.",
      result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};


