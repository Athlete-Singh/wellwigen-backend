import cron from "node-cron";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import CoachAssignment from "../../features/trainer/coachAssignment.model.js";
import Trainer from "../../features/trainer/trainer.model.js";
import Notification from "../../features/notification/notification.model.js";
import {
  sendAutomatedWhatsApp,
  formatWhatsAppNumber,
  notifyAdminWhatsApp,
  ADMIN_EMAIL,
  ADMIN_PHONE,
} from "../services/whatsapp.js";
import { ioInstance } from "../../../server.js";

// In-memory queue fallback if MongoDB is in offline mode
const memoryAssignmentsQueue = [];

/**
 * Configure Nodemailer Transporter
 */
const getTransporter = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (user && pass) {
    const port = Number(process.env.SMTP_PORT) || 587;
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Local/Testing fallback
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "ethereal.user@ethereal.email",
      pass: "ethereal_password",
    },
  });
};

/**
 * Generate a beautiful, responsive HTML email for the Trainer
 */
export const buildCoachAssignmentEmailHtml = ({
  coachName,
  targetType = "client",
  targetName,
  targetEmail,
  targetPhone,
  targetGoal,
  plan,
  totalSessions,
  adminNotes,
  portalUrl,
}) => {
  const isGroup = targetType === "group";
  const typeLabel = isGroup ? "Group Class" : "Private Trainee";
  const cleanPhone = targetPhone ? formatWhatsAppNumber(targetPhone) : "";
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : "";

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Official Coach Assignment | Wellwigen Fitness</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); border: 1px solid #e2e8f0;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding: 36px 32px; background: linear-gradient(135deg, #004D40 0%, #00796B 60%, #009688 100%); text-align: center;">
                <div style="display: inline-block; padding: 6px 14px; background: rgba(255, 255, 255, 0.16); border-radius: 100px; margin-bottom: 14px; backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.25);">
                  <span style="font-size: 11px; font-weight: 800; color: #a7f3d0; text-transform: uppercase; letter-spacing: 1.5px;">
                    🎯 Official Coach Assignment
                  </span>
                </div>
                <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                  Wellwigen Fitness
                </h1>
                <p style="margin: 8px 0 0; font-size: 14px; color: #ccfbf1; font-weight: 500;">
                  You have been assigned as the lead coach for a new ${typeLabel.toLowerCase()}
                </p>
              </td>
            </tr>

            <!-- BODY CONTENT -->
            <tr>
              <td style="padding: 32px 28px;">
                <p style="margin: 0 0 16px; font-size: 16px; color: #0f172a; font-weight: 700;">
                  Hello Coach ${coachName},
                </p>
                <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                  Great news! The Wellwigen Admin team has officially assigned you as the lead coach for 
                  <strong style="color: #0f172a;">${targetName}</strong>. 
                  Below are the essential trainee and package details to help you get prepared for their program.
                </p>

                <!-- ASSIGNMENT DETAIL CARD -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; margin-bottom: 24px; overflow: hidden;">
                  <tr>
                    <td style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; background-color: #f1f5f9;">
                      <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0d9488;">
                        ${isGroup ? "GROUP SESSION DETAILS" : "TRAINEE PROFILE OVERVIEW"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 20px 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px;">
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 40%;">${isGroup ? "Class Title" : "Client Name"}:</td>
                          <td style="padding: 8px 0; color: #0f172a; font-weight: 800; font-size: 14px;">${targetName}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Fitness Goal:</td>
                          <td style="padding: 8px 0; color: #00796B; font-weight: 700;">${targetGoal || "General Fitness & Health"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Enrolled Plan:</td>
                          <td style="padding: 8px 0; color: #0f172a; font-weight: 700;">${plan || "Personal Training"}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Total Sessions:</td>
                          <td style="padding: 8px 0; color: #0f172a; font-weight: 700;">${totalSessions || 12} Sessions</td>
                        </tr>
                        ${
                          targetPhone
                            ? `
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Phone / WhatsApp:</td>
                          <td style="padding: 8px 0; color: #0f172a; font-weight: 700;">${targetPhone}</td>
                        </tr>`
                            : ""
                        }
                        ${
                          targetEmail
                            ? `
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Email:</td>
                          <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${targetEmail}</td>
                        </tr>`
                            : ""
                        }
                        ${
                          adminNotes
                            ? `
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-weight: 600; vertical-align: top;">Admin Note:</td>
                          <td style="padding: 8px 0; color: #334155; font-style: italic;">${adminNotes}</td>
                        </tr>`
                            : ""
                        }
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- ACTION CHECKLIST -->
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 16px; padding: 18px 20px; margin-bottom: 28px;">
                  <h4 style="margin: 0 0 10px; font-size: 13px; font-weight: 800; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px;">
                    📋 Recommended Next Steps
                  </h4>
                  <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #047857;">
                    <li>Open your <strong>Trainer Dashboard</strong> to review this trainee's enrollment.</li>
                    <li>Reach out via WhatsApp or phone to welcome them to Wellwigen.</li>
                    <li>Schedule their <strong>Session 1: Initial Assessment</strong>.</li>
                  </ul>
                </div>

                <!-- CTA BUTTONS -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 8px;">
                  <tr>
                    <td align="center">
                      <a href="${portalUrl}" target="_blank" style="display: inline-block; background: #00796B; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 14px; font-weight: 800; font-size: 14px; box-shadow: 0 4px 12px rgba(0, 150, 136, 0.35);">
                        🚀 Open Trainer Dashboard
                      </a>
                    </td>
                  </tr>
                  ${
                    waUrl
                      ? `
                  <tr>
                    <td align="center" style="padding-top: 14px;">
                      <a href="${waUrl}" target="_blank" style="display: inline-block; color: #059669; text-decoration: none; font-weight: 700; font-size: 13px;">
                        💬 Direct WhatsApp Client (+${cleanPhone}) &rarr;
                      </a>
                    </td>
                  </tr>`
                      : ""
                  }
                </table>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="margin: 0 0 6px; font-size: 12px; color: #64748b; font-weight: 600;">
                  Wellwigen Fitness & Wellness Platform
                </p>
                <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                  This is an automated dispatch sent via the Wellwigen Coach Assignment Cron Engine.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

/**
 * Enqueue a new Coach Assignment for background cron processing
 */
export const createCoachAssignment = async ({
  assignmentType = "client",
  targetId = "",
  targetName,
  targetEmail = "",
  targetPhone = "",
  targetGoal = "General Fitness",
  plan = "Personal Training",
  totalSessions = 12,
  coachId = "",
  coachName,
  coachEmail = "",
  coachPhone = "",
  adminNotes = "",
  assignedBy = "admin",
}) => {
  if (!coachName || !targetName) {
    throw new Error("Coach Name and Target Name are required for assignment.");
  }

  const payload = {
    assignmentType,
    targetId,
    targetName,
    targetEmail,
    targetPhone,
    targetGoal,
    plan,
    totalSessions: Number(totalSessions) || 12,
    coachId,
    coachName,
    coachEmail,
    coachPhone,
    adminNotes,
    assignedBy,
    assignedAt: new Date(),
    processed: false,
    notificationStatus: {
      panel: { sent: false },
      email: { sent: false },
      whatsapp: { sent: false },
    },
  };

  try {
    const isMongo = mongoose.connection.readyState === 1;
    if (isMongo) {
      const assignmentDoc = await CoachAssignment.create(payload);
      console.log(
        `📥 [ASSIGNMENT_QUEUE] Enqueued coach assignment (MongoDB): Coach ${coachName} -> ${targetName} (${assignmentDoc._id})`
      );
      return assignmentDoc;
    }
  } catch (err) {
    console.warn("⚠️ [ASSIGNMENT_QUEUE] Mongo insert error, queueing in memory:", err.message);
  }

  const memoryItem = {
    ...payload,
    _id: `mem_assign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  };
  memoryAssignmentsQueue.push(memoryItem);
  console.log(`📥 [ASSIGNMENT_QUEUE] Enqueued in memory: Coach ${coachName} -> ${targetName}`);
  return memoryItem;
};

/**
 * Automated Cron Job Runner: Process Pending Coach Assignments
 * Dispatches:
 * 1. Trainer Panel In-App Notification
 * 2. WhatsApp Message via Meta/Twilio/Direct
 * 3. Beautiful Responsive HTML Email
 */
export const runCoachAssignmentCron = async () => {
  try {
    let pendingAssignments = [];
    const isMongo = mongoose.connection.readyState === 1;

    if (isMongo) {
      try {
        pendingAssignments = await CoachAssignment.find({ processed: false }).limit(20);
      } catch (dbErr) {
        console.warn("⚠️ [ASSIGNMENT_CRON] DB query error:", dbErr.message);
      }
    }

    // Merge any memory queued items
    const memoryPending = memoryAssignmentsQueue.filter((a) => !a.processed);
    const allPending = [...pendingAssignments, ...memoryPending];

    if (allPending.length === 0) {
      return { success: true, processedCount: 0 };
    }

    console.log(
      `\n⚙️ [ASSIGNMENT_CRON] Found ${allPending.length} pending coach assignment(s) to notify automatically...`
    );

    const portalUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL.split(",")[0]}/trainer/dashboard`
      : "http://localhost:5177/trainer/dashboard";

    let successCount = 0;

    for (const assignment of allPending) {
      try {
        console.log(`\n⏳ [ASSIGNMENT_CRON] Processing assignment for Coach: "${assignment.coachName}" -> Target: "${assignment.targetName}"`);

        // 1. Resolve Coach details (live from Trainer model if available)
        let resolvedEmail = assignment.coachEmail;
        let resolvedPhone = assignment.coachPhone;
        let coachModel = null;

        if (isMongo) {
          try {
            coachModel = await Trainer.findOne({
              $or: [
                { _id: assignment.coachId },
                { id: assignment.coachId },
                { name: new RegExp(`^${assignment.coachName.trim()}$`, "i") },
                { email: assignment.coachEmail?.toLowerCase() },
              ],
            });
            if (coachModel) {
              resolvedEmail = coachModel.email || resolvedEmail;
              resolvedPhone = coachModel.phone || resolvedPhone;
            }
          } catch {}
        }

        // ---------------- 1. PANEL NOTIFICATION ----------------
        let panelSent = false;
        let createdNotifId = "";
        try {
          const panelTitle = `🎯 New ${assignment.assignmentType === "group" ? "Group Class" : "Trainee"} Assigned: ${assignment.targetName}`;
          const panelBody = `You have been assigned as lead coach for ${assignment.targetName} (${assignment.plan || "Fitness Program"}). Check your dashboard to view their goals.`;

          if (isMongo) {
            const notif = await Notification.create({
              recipientId: coachModel?._id || null,
              role: "provider",
              title: panelTitle,
              body: panelBody,
              data: {
                assignmentId: assignment._id?.toString(),
                targetName: assignment.targetName,
                targetType: assignment.assignmentType,
                plan: assignment.plan,
                goal: assignment.targetGoal,
              },
            });
            createdNotifId = notif._id?.toString();
          }

          // Emit real-time Socket.io event to Trainer panels
          if (ioInstance) {
            ioInstance.emit("trainerNotification", {
              title: panelTitle,
              message: panelBody,
              type: "assignment",
              link: "/trainer/dashboard",
              coachName: assignment.coachName,
              targetName: assignment.targetName,
              createdAt: new Date().toISOString(),
            });
          }
          panelSent = true;
          console.log(`  ✅ [PANEL] In-App Notification dispatched to Coach ${assignment.coachName}`);
        } catch (panelErr) {
          console.warn(`  ⚠️ [PANEL] In-app notification error:`, panelErr.message);
        }

        // ---------------- 2. WHATSAPP NOTIFICATION ----------------
        let whatsappSent = false;
        let waDirectUrl = "";
        let waError = null;

        if (resolvedPhone) {
          try {
            const waCustomText = `🏋️‍♂️ *NEW COACH ASSIGNMENT | Wellwigen* 🏋️‍♂️\n\nHello Coach *${assignment.coachName}*,\nGreat news! The Admin team has officially assigned you as the lead coach for:\n\n👤 *${assignment.assignmentType === "group" ? "Group Class" : "Trainee"}:* ${assignment.targetName}\n🎯 *Fitness Goal:* ${assignment.targetGoal || "General Fitness"}\n📦 *Plan:* ${assignment.plan || "Personal Training"}\n🗓️ *Sessions:* ${assignment.totalSessions || 12} Sessions\n${assignment.targetPhone ? `📱 *Client Phone:* ${assignment.targetPhone}\n` : ""}${assignment.targetEmail ? `📧 *Client Email:* ${assignment.targetEmail}\n` : ""}\n👉 *Open Your Portal to View Trainee Details:*\n${portalUrl}\n\nPlease reach out to ${assignment.targetName} to schedule their initial assessment!`;

            const waResult = await sendAutomatedWhatsApp({
              recipientPhone: resolvedPhone,
              recipientName: assignment.coachName,
              customMessage: waCustomText,
            });

            whatsappSent = waResult?.success || false;
            waDirectUrl = waResult?.directUrl || "";
            console.log(`  ✅ [WHATSAPP] WhatsApp dispatched to Coach ${assignment.coachName} (${resolvedPhone})`);
          } catch (waErr) {
            waError = waErr.message;
            console.warn(`  ⚠️ [WHATSAPP] Failed WhatsApp dispatch:`, waErr.message);
          }
        } else {
          console.log(`  ℹ️ [WHATSAPP] Skipped: No phone number registered for Coach ${assignment.coachName}`);
        }

        // ---------------- 3. EMAIL NOTIFICATION ----------------
        let emailSent = false;
        let emailError = null;

        if (resolvedEmail) {
          try {
            const transporter = getTransporter();
            const emailHtml = buildCoachAssignmentEmailHtml({
              coachName: assignment.coachName,
              targetType: assignment.assignmentType,
              targetName: assignment.targetName,
              targetEmail: assignment.targetEmail,
              targetPhone: assignment.targetPhone,
              targetGoal: assignment.targetGoal,
              plan: assignment.plan,
              totalSessions: assignment.totalSessions,
              adminNotes: assignment.adminNotes,
              portalUrl,
            });

            await transporter.sendMail({
              from: `"Wellwigen Fitness" <${process.env.SMTP_USER || process.env.GMAIL_USER || "no-reply@wellwigen.com"}>`,
              to: resolvedEmail,
              subject: `🎯 New Coach Assignment: You have been assigned to ${assignment.targetName} | Wellwigen Fitness`,
              html: emailHtml,
            });

            emailSent = true;
            console.log(`  ✅ [EMAIL] Beautiful HTML Email dispatched to Coach ${assignment.coachName} (${resolvedEmail})`);
          } catch (emErr) {
            emailError = emErr.message;
            console.warn(`  ⚠️ [EMAIL] Failed sending email to ${resolvedEmail}:`, emErr.message);
          }
        } else {
          console.log(`  ℹ️ [EMAIL] Skipped: No email address registered for Coach ${assignment.coachName}`);
        }

        // Alert Superadmin on WhatsApp (+91 9598506627)
        notifyAdminWhatsApp({
          title: "COACH ASSIGNMENT EXECUTED",
          message: `🎯 Coach: ${assignment.coachName} (${assignment.coachEmail || "N/A"})\n👤 Assigned Trainee: ${assignment.targetName}\n📞 Trainee Phone: ${assignment.targetPhone || "N/A"}\n🏋️ Plan: ${assignment.plan || "Custom Plan"}\n📊 Sessions: ${assignment.totalSessions || 12}\n\nNotifications dispatched to Coach & Client.`,
          link: "https://wellwigen.com/admin",
        }).catch(() => {});

        // ---------------- 4. UPDATE ASSIGNMENT RECORD ----------------
        const updatePayload = {
          processed: true,
          processedAt: new Date(),
          notificationStatus: {
            panel: { sent: panelSent, sentAt: new Date(), notificationId: createdNotifId },
            email: { sent: emailSent, sentAt: emailSent ? new Date() : null, error: emailError },
            whatsapp: { sent: whatsappSent, sentAt: whatsappSent ? new Date() : null, directUrl: waDirectUrl, error: waError },
          },
        };

        if (isMongo && assignment.save) {
          Object.assign(assignment, updatePayload);
          await assignment.save();
        } else {
          Object.assign(assignment, updatePayload);
        }

        successCount++;
        console.log(`🎉 [ASSIGNMENT_CRON] Successfully completed assignment notification cycle for Coach: ${assignment.coachName} -> Trainee: ${assignment.targetName}\n`);
      } catch (singleErr) {
        console.error(`❌ [ASSIGNMENT_CRON] Error processing assignment ${assignment._id}:`, singleErr);
      }
    }

    return { success: true, processedCount: successCount };
  } catch (err) {
    console.error("❌ [ASSIGNMENT_CRON] Top-level cron runner error:", err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Initialize and start the Coach Assignment Notification Cron Job
 * Runs every 30 seconds to provide instant, real-time automated delivery
 */
export const startCoachAssignmentCron = () => {
  // Run every 30 seconds in background
  const task = cron.schedule("*/30 * * * * *", async () => {
    await runCoachAssignmentCron();
  });

  console.log("🚀 [SYSTEM] Coach Assignment Notification Cron Job Initialized (Every 30s)");
  return task;
};

export default {
  createCoachAssignment,
  runCoachAssignmentCron,
  startCoachAssignmentCron,
  buildCoachAssignmentEmailHtml,
};
