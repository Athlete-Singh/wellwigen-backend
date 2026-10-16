import mongoose from "mongoose";
import Inquiry from "./inquiry.model.js";
import nodemailer from "nodemailer";
import {
  getAllLocalInquiries,
  findLocalInquiryById,
  saveLocalInquiry,
  updateLocalInquiry,
  deleteLocalInquiry,
} from "../../core/services/localDb.js";
import {
  sendAutomatedWhatsApp,
  buildWhatsAppUrl,
  formatWhatsAppNumber,
  notifyAdminWhatsApp,
  ADMIN_PHONE,
  ADMIN_EMAIL,
} from "../../core/services/whatsapp.js";

// In-memory rate limiting map (IP -> timestamp)
const recentSubmissions = new Map();

// Helper to sanitize strings
const sanitize = (str) => {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[<>]/g, "");
};

// Check if MongoDB is connected & ready
const isMongoLive = () => mongoose.connection && mongoose.connection.readyState === 1;

// Helper to get configured nodemailer transporter
const getTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
};

/**
 * Send automated confirmation email to the Customer
 */
const sendCustomerConfirmationEmail = async ({ fullName, email, phone, program, plan, fitnessGoal, preferredTiming, message }) => {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("⚠️ [INQUIRY_EMAIL] SMTP not configured; skipping customer confirmation email.");
      return;
    }

    const waLink = `https://wa.me/919598506627?text=${encodeURIComponent(
      `Hi Wellwigen team! My name is ${fullName}. I just inquired about ${program} (${plan || "Trial"}).`
    )}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 20px; color: #1E293B;">
        <div style="border-bottom: 2px solid #F1F5F9; padding-bottom: 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
          <h2 style="margin: 0; color: #0F172A; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">WELLWIGEN</h2>
          <span style="font-size: 11px; font-weight: 700; color: #1FB5A3; text-transform: uppercase; letter-spacing: 1px;">STRONGER BODY. BETTER YOU.</span>
        </div>

        <h3 style="color: #0F172A; font-size: 20px; font-weight: 800; margin: 0 0 12px 0;">
          Welcome to Wellwigen, ${fullName}! 🎉
        </h3>

        <p style="font-size: 14.5px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
          Thank you for inquiring to join <strong>Wellwigen ${program}</strong>! We have received your application and an expert coach is reviewing your fitness goals.
        </p>

        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">
            Your Inquiry Summary
          </h4>
          <table style="width: 100%; font-size: 13.5px; line-height: 1.8; color: #334155;">
            <tr>
              <td style="color: #64748B; width: 140px;"><strong>Program:</strong></td>
              <td style="font-weight: 600; color: #0F172A;">${program}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Track / Plan:</strong></td>
              <td style="font-weight: 600; color: #1FB5A3;">${plan || "Trial Class"}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Fitness Goal:</strong></td>
              <td>${fitnessGoal || "General Fitness"}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Preferred Time:</strong></td>
              <td>${preferredTiming || "Flexible"}</td>
            </tr>
            ${message ? `
            <tr>
              <td style="color: #64748B; vertical-align: top;"><strong>Notes:</strong></td>
              <td>${message}</td>
            </tr>` : ""}
          </table>
        </div>

        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 18px; margin-bottom: 24px;">
          <h5 style="margin: 0 0 6px 0; font-size: 13.5px; font-weight: 700; color: #166534;">What happens next?</h5>
          <p style="margin: 0; font-size: 13px; color: #15803D; line-height: 1.5;">
            Our head coach will reach out to you directly on WhatsApp or phone (<strong>${phone}</strong>) within a few hours to confirm your schedule and provide your personal class link.
          </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${waLink}" style="display: inline-block; padding: 14px 28px; background-color: #25D366; color: #ffffff; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.35);">
            💬 Chat with Coach on WhatsApp Now
          </a>
        </div>

        <div style="border-top: 1px solid #F1F5F9; padding-top: 20px; font-size: 12px; color: #94A3B8; line-height: 1.5;">
          <p style="margin: 0 0 4px 0;"><strong>Wellwigen Member Success Team</strong></p>
          <p style="margin: 0 0 4px 0;">Website: <a href="http://localhost:5177" style="color: #1FB5A3; text-decoration: none;">wellwigen.com</a> &bull; Support: wellwigen@gmail.com</p>
          <p style="margin: 0;">You received this email because you submitted an inquiry on the Wellwigen fitness portal.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Wellwigen Fitness" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🏋️ Welcome to Wellwigen! We've received your ${program} inquiry`,
      html,
    });

    console.log(`✉️ [INQUIRY_EMAIL] Automated customer confirmation email sent to ${email}`);
  } catch (err) {
    console.warn(`⚠️ [INQUIRY_EMAIL] Failed to send customer confirmation email:`, err.message);
  }
};

/**
 * Send instant alert email to Admin about the new inquiry
 */
const sendAdminInquiryAlertEmail = async ({ fullName, email, phone, program, plan, fitnessGoal, preferredTiming, message, id }) => {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("⚠️ [INQUIRY_EMAIL] SMTP not configured; skipping admin alert email.");
      return;
    }

    const cleanPhone = formatWhatsAppNumber(phone);
    const waUrl = buildWhatsAppUrl(
      cleanPhone,
      `Hi ${fullName}! This is Wellwigen Coaching. We received your inquiry regarding ${program} (${plan || "Trial"}). Are you ready for a quick 5-min intro call to get your schedule started?`
    );

    const adminRecipients = ["wellwigen@gmail.com"];
    if (process.env.SMTP_USER && !adminRecipients.includes(process.env.SMTP_USER)) {
      adminRecipients.push(process.env.SMTP_USER);
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 18px; color: #1E293B;">
        <div style="border-bottom: 2px solid #FF6B35; padding-bottom: 14px; margin-bottom: 20px;">
          <span style="font-size: 11px; font-weight: 800; color: #FF6B35; text-transform: uppercase; letter-spacing: 1px;">🚨 NEW LEAD ALERT &bull; INQUIRIES BOX</span>
          <h2 style="margin: 6px 0 0 0; color: #0F172A; font-size: 22px; font-weight: 800;">
            ${fullName} wants to join ${program}
          </h2>
        </div>

        <div style="background: #FFF7ED; border: 1px solid #FFEDD5; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
          <table style="width: 100%; font-size: 14px; line-height: 1.8; color: #334155;">
            <tr>
              <td style="color: #64748B; width: 140px;"><strong>Visitor Name:</strong></td>
              <td style="font-weight: 700; color: #0F172A;">${fullName}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Phone / WhatsApp:</strong></td>
              <td style="font-weight: 700; color: #0F172A;">
                <a href="tel:${phone}" style="color: #0F172A; text-decoration: none;">${phone}</a>
              </td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Email:</strong></td>
              <td><a href="mailto:${email}" style="color: #1FB5A3;">${email}</a></td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Program:</strong></td>
              <td style="font-weight: 600; color: #0F172A;">${program}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Chosen Plan:</strong></td>
              <td style="font-weight: 600; color: #FF6B35;">${plan || "Trial Class"}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Fitness Goal:</strong></td>
              <td>${fitnessGoal || "General"}</td>
            </tr>
            <tr>
              <td style="color: #64748B;"><strong>Timing:</strong></td>
              <td>${preferredTiming || "Flexible"}</td>
            </tr>
            ${message ? `
            <tr>
              <td style="color: #64748B; vertical-align: top;"><strong>Message:</strong></td>
              <td style="font-style: italic;">"${message}"</td>
            </tr>` : ""}
          </table>
        </div>

        <!-- Direct Action Buttons for Admin -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <a href="${waUrl}" style="flex: 1; text-align: center; display: inline-block; padding: 12px 18px; background-color: #25D366; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13.5px;">
            💬 WhatsApp Client (+${cleanPhone})
          </a>
          <a href="tel:${phone}" style="flex: 1; text-align: center; display: inline-block; padding: 12px 18px; background-color: #0F172A; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13.5px;">
            📞 Call Client
          </a>
        </div>

        <div style="text-align: center; margin-top: 16px;">
          <a href="http://localhost:5177/admin/dashboard" style="color: #1FB5A3; font-weight: 700; text-decoration: none; font-size: 13px;">
            ➜ Open Wellwigen Admin Inquiries Dashboard
          </a>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Wellwigen Leads" <${process.env.SMTP_USER}>`,
      to: adminRecipients.join(", "),
      subject: `🚨 [NEW INQUIRY] ${fullName} - ${program} (${plan || "Trial"})`,
      html,
    });

    console.log(`✉️ [INQUIRY_EMAIL] Admin alert email dispatched to ${adminRecipients.join(", ")}`);
  } catch (err) {
    console.warn(`⚠️ [INQUIRY_EMAIL] Failed to send admin alert email:`, err.message);
  }
};

// ================= PUBLIC: SUBMIT NEW INQUIRY =================
export const createInquiry = async (req, res) => {
  try {
    const rawFullName = req.body.fullName || req.body.name || "";
    const rawEmail = req.body.email || "";
    const rawPhone = req.body.phone || "";
    const rawFitnessGoal = req.body.fitnessGoal || "";
    const rawProgram = req.body.program || "General Inquiry";
    const rawPlan = req.body.plan || "";
    const rawPreferredTiming = req.body.preferredTiming || req.body.preferredTime || "";
    const rawMessage = req.body.message || "";

    const fullName = sanitize(rawFullName);
    const email = sanitize(rawEmail).toLowerCase();
    const phone = sanitize(rawPhone);
    const fitnessGoal = sanitize(rawFitnessGoal);
    const program = sanitize(rawProgram);
    const plan = sanitize(rawPlan);
    const preferredTiming = sanitize(rawPreferredTiming);
    const message = sanitize(rawMessage);

    // 1. Validation
    if (!fullName || fullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid full name (at least 2 characters).",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const phoneClean = phone.replace(/[^0-9+]/g, "");
    if (!phoneClean || phoneClean.replace(/\D/g, "").length < 7) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid contact phone or WhatsApp number.",
      });
    }

    // 2. Spam / Duplicate Rate Limiting (5-second window per email/IP)
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const rateLimitKey = `${clientIp}_${email}`;
    const now = Date.now();
    const lastTime = recentSubmissions.get(rateLimitKey);

    if (lastTime && now - lastTime < 5000) {
      return res.status(429).json({
        success: false,
        message: "Please wait a few seconds before submitting another inquiry.",
      });
    }
    recentSubmissions.set(rateLimitKey, now);

    if (recentSubmissions.size > 500) {
      for (const [key, ts] of recentSubmissions.entries()) {
        if (now - ts > 60000) recentSubmissions.delete(key);
      }
    }

    const inquiryPayload = {
      fullName,
      email,
      phone: phoneClean,
      fitnessGoal,
      program,
      plan,
      preferredTiming,
      message,
      status: "New",
      adminNotes: "",
      ip: clientIp,
    };

    // Save to localDb for 100% resilient persistence
    const savedLocal = saveLocalInquiry(inquiryPayload);

    // Also persist to MongoDB if connected
    let mongoInquiry = null;
    if (isMongoLive()) {
      try {
        mongoInquiry = await Inquiry.create(inquiryPayload);
      } catch (mErr) {
        console.warn("⚠️ [INQUIRY] Mongo create skipped/failed:", mErr.message);
      }
    }

    const finalRecord = mongoInquiry || savedLocal;
    const finalId = finalRecord._id || finalRecord.id;

    console.log(`📥 [INQUIRY] New lead saved: ${fullName} (${program} - ${plan}) [ID: ${finalId}]`);

    // 3. Automated WhatsApp integration
    const waResult = await sendAutomatedWhatsApp({
      recipientPhone: phoneClean,
      recipientName: fullName,
      program,
      plan,
      customMessage: `Hi ${fullName}! Welcome to Wellwigen. We received your inquiry to join ${program} (${plan || "Trial Class"}). Our coaching team has received your details and will connect with you right away!`,
    });

    // 4. Send background automated emails (Customer Confirmation + Admin Alert)
    sendCustomerConfirmationEmail({
      fullName,
      email,
      phone: phoneClean,
      program,
      plan,
      fitnessGoal,
      preferredTiming,
      message,
    });

    sendAdminInquiryAlertEmail({
      fullName,
      email,
      phone: phoneClean,
      program,
      plan,
      fitnessGoal,
      preferredTiming,
      message,
      id: finalId,
    });

    // 5. Instantly alert Superadmin via WhatsApp (+91 9598506627)
    notifyAdminWhatsApp({
      title: "NEW CLIENT LEAD / INQUIRY",
      message: `👤 Client: ${fullName}\n📞 Phone: ${phoneClean}\n✉️ Email: ${email}\n🏋️ Program: ${program}\n💎 Plan: ${plan || "Trial Class"}\n🎯 Goal: ${fitnessGoal || "General Fitness"}\n⏰ Preferred Time: ${preferredTiming || "Flexible"}${message ? `\n💬 Note: "${message}"` : ""}`,
      link: "https://wellwigen.com/admin",
    }).catch((waErr) => {
      console.warn("⚠️ [INQUIRY] Admin WhatsApp alert notice:", waErr.message);
    });

    return res.status(201).json({
      success: true,
      message: "Your inquiry has been received! Our team will contact you shortly.",
      inquiry: {
        id: finalId,
        fullName: finalRecord.fullName,
        email: finalRecord.email,
        phone: finalRecord.phone,
        program: finalRecord.program,
        plan: finalRecord.plan,
        status: finalRecord.status,
        createdAt: finalRecord.createdAt,
      },
      whatsappUrl: waResult.directUrl,
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error in createInquiry:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while saving your inquiry. Please try again.",
      error: error.message,
    });
  }
};

// ================= ADMIN: GET ALL INQUIRIES WITH FILTERS & STATS =================
export const getInquiries = async (req, res) => {
  try {
    const { search, status, program, sortBy = "createdAt", sortOrder = "desc", page = 1, limit = 50 } = req.query;

    // Check if MongoDB is connected and query succeeds
    if (isMongoLive()) {
      try {
        const query = {};
        if (status && status !== "All") {
          query.status = status;
        }
        if (program && program !== "All") {
          query.program = new RegExp(program, "i");
        }
        if (search && search.trim()) {
          const searchRegex = new RegExp(search.trim(), "i");
          query.$or = [
            { fullName: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { plan: searchRegex },
            { fitnessGoal: searchRegex },
          ];
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [inquiries, totalMatching] = await Promise.all([
          Inquiry.find(query).sort(sortOptions).skip(skip).limit(take).lean(),
          Inquiry.countDocuments(query),
        ]);

        const [total, newCount, contactedCount, interestedCount, convertedCount, closedCount] = await Promise.all([
          Inquiry.countDocuments(),
          Inquiry.countDocuments({ status: "New" }),
          Inquiry.countDocuments({ status: "Contacted" }),
          Inquiry.countDocuments({ status: "Interested" }),
          Inquiry.countDocuments({ status: "Converted" }),
          Inquiry.countDocuments({ status: "Closed" }),
        ]);

        return res.json({
          success: true,
          data: inquiries,
          pagination: {
            page: parseInt(page),
            limit: take,
            total: totalMatching,
            totalPages: Math.ceil(totalMatching / take) || 1,
          },
          stats: {
            total,
            new: newCount,
            contacted: contactedCount,
            interested: interestedCount,
            converted: convertedCount,
            closed: closedCount,
          },
        });
      } catch (mongoErr) {
        console.warn("⚠️ [INQUIRY] MongoDB find failed, failing over to local database:", mongoErr.message);
      }
    }

    // ================= RESILIENT LOCAL DB FALLBACK =================
    let allInquiries = getAllLocalInquiries();

    // 1. Filter by Status
    let filtered = allInquiries;
    if (status && status !== "All") {
      filtered = filtered.filter((i) => i.status === status);
    }

    // 2. Filter by Program
    if (program && program !== "All") {
      const pLower = program.toLowerCase();
      filtered = filtered.filter((i) => (i.program || "").toLowerCase().includes(pLower));
    }

    // 3. Filter by Search term
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((i) =>
        (i.fullName || "").toLowerCase().includes(q) ||
        (i.email || "").toLowerCase().includes(q) ||
        (i.phone || "").toLowerCase().includes(q) ||
        (i.plan || "").toLowerCase().includes(q) ||
        (i.fitnessGoal || "").toLowerCase().includes(q)
      );
    }

    // 4. Sort
    filtered.sort((a, b) => {
      const timeA = new Date(a[sortBy] || a.createdAt || 0).getTime();
      const timeB = new Date(b[sortBy] || b.createdAt || 0).getTime();
      return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
    });

    // 5. Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const totalMatching = filtered.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    // 6. Stats calculation across all inquiries
    const total = allInquiries.length;
    const newCount = allInquiries.filter((i) => i.status === "New").length;
    const contactedCount = allInquiries.filter((i) => i.status === "Contacted").length;
    const interestedCount = allInquiries.filter((i) => i.status === "Interested").length;
    const convertedCount = allInquiries.filter((i) => i.status === "Converted").length;
    const closedCount = allInquiries.filter((i) => i.status === "Closed").length;

    return res.json({
      success: true,
      data: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limitNum) || 1,
      },
      stats: {
        total,
        new: newCount,
        contacted: contactedCount,
        interested: interestedCount,
        converted: convertedCount,
        closed: closedCount,
      },
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error in getInquiries:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch inquiries.",
      error: error.message,
    });
  }
};

// ================= ADMIN: GET SINGLE INQUIRY =================
export const getInquiryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (isMongoLive()) {
      try {
        const inquiry = await Inquiry.findById(id);
        if (inquiry) return res.json({ success: true, data: inquiry });
      } catch {}
    }

    const localInquiry = findLocalInquiryById(id);
    if (!localInquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    return res.json({ success: true, data: localInquiry });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= ADMIN: UPDATE INQUIRY =================
export const updateInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, plan, program, preferredTiming, fitnessGoal } = req.body;

    const updateFields = {};
    if (status !== undefined) updateFields.status = status;
    if (adminNotes !== undefined) updateFields.adminNotes = adminNotes;
    if (plan !== undefined) updateFields.plan = plan;
    if (program !== undefined) updateFields.program = program;
    if (preferredTiming !== undefined) updateFields.preferredTiming = preferredTiming;
    if (fitnessGoal !== undefined) updateFields.fitnessGoal = fitnessGoal;

    const updatedLocal = updateLocalInquiry(id, updateFields);

    let updatedMongo = null;
    if (isMongoLive()) {
      try {
        updatedMongo = await Inquiry.findByIdAndUpdate(id, updateFields, {
          new: true,
          runValidators: true,
        });
      } catch (err) {}
    }

    const finalUpdated = updatedMongo || updatedLocal;
    if (!finalUpdated) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    return res.json({
      success: true,
      message: "Inquiry updated successfully.",
      data: finalUpdated,
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error in updateInquiry:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= ADMIN: DELETE INQUIRY =================
export const deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Inquiry ID is required." });
    }

    let deletedMongo = null;
    if (isMongoLive()) {
      try {
        if (mongoose.Types.ObjectId.isValid(id) && typeof id === "string" && id.length === 24) {
          deletedMongo = await Inquiry.findByIdAndDelete(id);
        } else {
          deletedMongo = await Inquiry.findOneAndDelete({
            $or: [{ _id: id }, { id: id }],
          });
        }
      } catch (mongoErr) {
        console.error("❌ [INQUIRY] Error deleting inquiry from MongoDB:", mongoErr.message);
      }
    }

    const deletedLocal = deleteLocalInquiry(id);

    // If deleted from mongo, also clean up matching local entry by email/message or id if present
    if (deletedMongo) {
      try {
        const localList = getAllLocalInquiries();
        const match = localList.find(
          (item) =>
            (deletedMongo.email && item.email === deletedMongo.email && item.message === deletedMongo.message) ||
            String(item._id) === String(id) ||
            String(item.id) === String(id)
        );
        if (match) {
          deleteLocalInquiry(match._id || match.id);
        }
      } catch {}
    }

    if (!deletedMongo && !deletedLocal) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    console.log(`🗑️ [INQUIRY] Successfully deleted inquiry: ${id} (Mongo: ${!!deletedMongo}, Local: ${!!deletedLocal})`);

    return res.json({
      success: true,
      message: "Inquiry deleted successfully.",
      data: deletedMongo || { _id: id },
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error in deleteInquiry:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= ADMIN: SEND EMAIL REPLY VIA NODEMAILER =================
export const replyEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, message, recipientEmail, recipientName } = req.body;

    let inquiry = null;
    if (isMongoLive()) {
      try {
        inquiry = await Inquiry.findById(id);
      } catch {}
    }
    if (!inquiry) {
      inquiry = findLocalInquiryById(id);
    }

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    const toEmail = recipientEmail || inquiry.email;
    const toName = recipientName || inquiry.fullName;
    const emailSubject = subject || `Regarding your Wellwigen Inquiry - ${inquiry.program}`;

    // Auto-update inquiry status and tracking
    const newStatus = inquiry.status === "New" ? "Contacted" : inquiry.status;
    const newContactedVia = inquiry.contactedVia === "whatsapp" ? "both" : "email";
    const updateData = {
      status: newStatus,
      lastContactedAt: new Date().toISOString(),
      contactedVia: newContactedVia,
    };

    updateLocalInquiry(id, updateData);
    if (isMongoLive()) {
      try {
        await Inquiry.findByIdAndUpdate(id, updateData);
      } catch {}
    }

    const transporter = getTransporter();

    if (!transporter) {
      console.warn("⚠️ [INQUIRY] SMTP credentials not set in .env. Returning fallback guidance.");
      return res.json({
        success: false,
        smtpConfigured: false,
        fallbackMailto: `mailto:${toEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message || "")}`,
        message: "SMTP is not fully configured in .env. A mailto: link was generated as a fallback.",
        data: { ...inquiry, ...updateData },
      });
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 18px; color: #1E293B;">
        <div style="border-bottom: 2px solid #F1F5F9; padding-bottom: 18px; margin-bottom: 22px; display: flex; align-items: center; justify-content: space-between;">
          <h2 style="margin: 0; color: #0F172A; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">WELLWIGEN</h2>
          <span style="font-size: 11px; font-weight: 700; color: #1FB5A3; text-transform: uppercase; letter-spacing: 1px;">STRONGER BODY. BETTER YOU.</span>
        </div>
        
        <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 18px;">
          Hi <strong>${toName}</strong>,
        </p>

        <div style="font-size: 14.5px; color: #334155; line-height: 1.65; white-space: pre-wrap; background: #F8FAFC; padding: 20px; border-radius: 12px; border-left: 4px solid #1FB5A3; margin: 18px 0;">
${message}
        </div>

        <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #64748B; line-height: 1.5;">
          <p style="margin: 0 0 6px 0;"><strong>Wellwigen Member Support</strong></p>
          <p style="margin: 0 0 4px 0;">Website: <a href="http://localhost:5177" style="color: #1FB5A3; text-decoration: none;">wellwigen.com</a></p>
          <p style="margin: 0;">Have questions? Reply directly to this email or message us on WhatsApp.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Wellwigen Fitness" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: emailSubject,
      text: message,
      html: htmlContent,
    });

    console.log(`✉️ [INQUIRY] Email successfully sent to ${toEmail}`);

    return res.json({
      success: true,
      message: `Email reply sent successfully to ${toEmail}!`,
      data: { ...inquiry, ...updateData },
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error in replyEmail:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to send email: ${error.message}`,
    });
  }
};

// ================= ADMIN: MARK INQUIRY AS CONTACTED =================
export const markContacted = async (req, res) => {
  try {
    const { id } = req.params;
    const { contactedVia = "whatsapp" } = req.body;

    let inquiry = null;
    if (isMongoLive()) {
      try {
        inquiry = await Inquiry.findById(id);
      } catch {}
    }
    if (!inquiry) {
      inquiry = findLocalInquiryById(id);
    }

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    const newStatus = inquiry.status === "New" ? "Contacted" : inquiry.status;
    let newContactedVia = contactedVia;
    if (inquiry.contactedVia === "email" && contactedVia === "whatsapp") {
      newContactedVia = "both";
    } else if (inquiry.contactedVia === "whatsapp" && contactedVia === "email") {
      newContactedVia = "both";
    }

    const updateData = {
      status: newStatus,
      lastContactedAt: new Date().toISOString(),
      contactedVia: newContactedVia,
    };

    const updatedLocal = updateLocalInquiry(id, updateData);
    let updatedMongo = null;
    if (isMongoLive()) {
      try {
        updatedMongo = await Inquiry.findByIdAndUpdate(id, updateData, { new: true });
      } catch {}
    }

    return res.json({
      success: true,
      message: "Inquiry marked as Contacted.",
      data: updatedMongo || updatedLocal,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= ADMIN: CONVERT INQUIRY TO SUBSCRIBED CLIENT =================
export const convertToClient = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      plan,
      program,
      price = 1999,
      billingCycle = "monthly",
      assignedCoach = "",
      assignedCoachId = "",
      totalSessions = 12,
      adminNotes = "",
    } = req.body;

    let inquiry = null;
    if (isMongoLive()) {
      try {
        inquiry = await Inquiry.findById(id);
      } catch {}
    }
    if (!inquiry) {
      inquiry = findLocalInquiryById(id);
    }

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const clientNote = `[SUBSCRIBED CLIENT] Converted on ${new Date().toLocaleDateString("en-IN")}. Plan: ${plan || inquiry.plan || "Monthly Transformation"}, Coach: ${assignedCoach}.${adminNotes ? ` Note: ${adminNotes}` : ""}`;

    const updateData = {
      status: "Converted",
      plan: plan || inquiry.plan,
      program: program || inquiry.program,
      adminNotes: inquiry.adminNotes ? `${inquiry.adminNotes}\n${clientNote}` : clientNote,
      lastContactedAt: new Date().toISOString(),
    };

    updateLocalInquiry(id, updateData);

    let updatedMongo = null;
    let createdUser = null;
    let createdSubscription = null;

    if (isMongoLive()) {
      try {
        updatedMongo = await Inquiry.findByIdAndUpdate(id, updateData, { new: true });

        // Check if User exists in MongoDB
        const User = mongoose.model("User");
        let existingUser = await User.findOne({ email: inquiry.email.toLowerCase() });
        if (!existingUser) {
          existingUser = await User.create({
            name: inquiry.fullName,
            email: inquiry.email.toLowerCase(),
            phone: inquiry.phone,
            password: "client_" + Math.random().toString(36).substring(2, 9),
            role: "user",
          });
        }
        createdUser = existingUser;

        // Create Active Subscription
        const Subscription = mongoose.model("Subscription");
        createdSubscription = await Subscription.create({
          userId: existingUser._id.toString(),
          plan: plan || inquiry.plan || "Monthly Transformation",
          price: Number(price) || 1999,
          billingCycle: billingCycle || "monthly",
          status: "active",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: true,
        });
      } catch (dbErr) {
        console.warn("⚠️ [CONVERT_CLIENT] Mongo sync error (continuing with local response):", dbErr.message);
      }
    }

    const clientPayload = {
      id: createdUser?._id?.toString() || `cli_${Date.now()}`,
      name: inquiry.fullName,
      email: inquiry.email,
      phone: inquiry.phone,
      goal: inquiry.fitnessGoal || "General Fitness",
      plan: plan || inquiry.plan || "Monthly Transformation",
      program: program || inquiry.program || "Personal Training",
      sessionsCompleted: 0,
      totalSessions: Number(totalSessions) || 12,
      nextSession: "Session 1: Initial Assessment",
      status: "Active",
      subscriptionStatus: "Active",
      renewalDate,
      assignedCoach,
      assignedCoachId,
      inquiryId: id,
      subscriptionId: createdSubscription?._id?.toString(),
    };

    // 🤖 Automatically enqueue Coach Assignment for background Cron notification
    if (assignedCoach && assignedCoach !== "Unassigned") {
      try {
        const { createCoachAssignment } = await import("../../core/jobs/assignmentCron.js");
        await createCoachAssignment({
          assignmentType: "client",
          targetId: clientPayload.id,
          targetName: inquiry.fullName,
          targetEmail: inquiry.email,
          targetPhone: inquiry.phone,
          targetGoal: inquiry.fitnessGoal || "General Fitness",
          plan: clientPayload.plan,
          totalSessions: clientPayload.totalSessions,
          coachName: assignedCoach,
          coachId: assignedCoachId,
          adminNotes: adminNotes || inquiry.adminNotes || "",
          assignedBy: "admin",
        });
      } catch (assignErr) {
        console.warn("⚠️ [INQUIRY] Error enqueueing coach assignment for cron:", assignErr.message);
      }
    }

    console.log(`🎉 [CLIENT] Inquiry converted to Subscribed Client: ${inquiry.fullName} -> Plan: ${clientPayload.plan}`);

    return res.json({
      success: true,
      message: `${inquiry.fullName} has been successfully added to Clients with an active subscription!`,
      inquiry: updatedMongo || { ...inquiry, ...updateData },
      client: clientPayload,
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error converting to client:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
