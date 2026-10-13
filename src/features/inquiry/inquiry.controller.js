/* [DISABLED FOR FUTURE USE] Original inquiry controller without localDb fallback
import Inquiry from "./inquiry.model.js";
import nodemailer from "nodemailer";

// In-memory rate limiting map (IP -> timestamp)
const recentSubmissions = new Map();

// Helper to sanitize strings
const sanitize = (str) => {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[<>]/g, "");
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

    // Clean old entries from map periodically
    if (recentSubmissions.size > 500) {
      for (const [key, ts] of recentSubmissions.entries()) {
        if (now - ts > 60000) recentSubmissions.delete(key);
      }
    }

    // 3. Save to MongoDB
    const inquiry = await Inquiry.create({
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
    });

    console.log(`📥 [INQUIRY] New lead saved: ${fullName} (${program} - ${plan}) [ID: ${inquiry._id}]`);

    return res.status(201).json({
      success: true,
      message: "Your inquiry has been received! Our team will contact you shortly.",
      inquiry: {
        id: inquiry._id,
        fullName: inquiry.fullName,
        email: inquiry.email,
        phone: inquiry.phone,
        program: inquiry.program,
        plan: inquiry.plan,
        status: inquiry.status,
        createdAt: inquiry.createdAt,
      },
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

    const query = {};

    // Filter by Status
    if (status && status !== "All") {
      query.status = status;
    }

    // Filter by Program
    if (program && program !== "All") {
      query.program = new RegExp(program, "i");
    }

    // Search by Name, Email, or Phone
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

    // Aggregate summary statistics across all inquiries
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
    const inquiry = await Inquiry.findById(id);

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    return res.json({ success: true, data: inquiry });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= ADMIN: UPDATE INQUIRY (STATUS, NOTES, ETC.) =================
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

    const updated = await Inquiry.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    return res.json({
      success: true,
      message: "Inquiry updated successfully.",
      data: updated,
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
    const deleted = await Inquiry.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    return res.json({ success: true, message: "Inquiry deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ================= ADMIN: SEND EMAIL REPLY VIA NODEMAILER =================
export const replyEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, message, recipientEmail, recipientName } = req.body;

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    const toEmail = recipientEmail || inquiry.email;
    const toName = recipientName || inquiry.fullName;
    const emailSubject = subject || `Regarding your Wellwigen Inquiry - ${inquiry.program}`;

    // Build Email Transporter
    const isSmtpConfigured =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (!isSmtpConfigured) {
      console.warn("⚠️ [INQUIRY] SMTP credentials not set in .env. Returning fallback guidance.");
      // Auto-update inquiry to Contacted anyway
      inquiry.status = inquiry.status === "New" ? "Contacted" : inquiry.status;
      inquiry.lastContactedAt = new Date();
      inquiry.contactedVia = inquiry.contactedVia === "whatsapp" ? "both" : "email";
      await inquiry.save();

      return res.json({
        success: false,
        smtpConfigured: false,
        fallbackMailto: `mailto:${toEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message || "")}`,
        message: "SMTP is not fully configured in .env. A mailto: link was generated as a fallback.",
        data: inquiry,
      });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

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

    // Auto-update inquiry status and tracking
    inquiry.status = inquiry.status === "New" ? "Contacted" : inquiry.status;
    inquiry.lastContactedAt = new Date();
    inquiry.contactedVia = inquiry.contactedVia === "whatsapp" ? "both" : "email";
    await inquiry.save();

    return res.json({
      success: true,
      message: `Email reply sent successfully to ${toEmail}!`,
      data: inquiry,
    });
  } catch (error) {
    console.error("❌ [INQUIRY] Error in replyEmail:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to send email: ${error.message}`,
    });
  }
};

// ================= ADMIN: MARK INQUIRY AS CONTACTED (FOR WHATSAPP TRACKING) =================
export const markContacted = async (req, res) => {
  try {
    const { id } = req.params;
    const { contactedVia = "whatsapp" } = req.body;

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    inquiry.status = inquiry.status === "New" ? "Contacted" : inquiry.status;
    inquiry.lastContactedAt = new Date();
    if (inquiry.contactedVia === "email" && contactedVia === "whatsapp") {
      inquiry.contactedVia = "both";
    } else if (inquiry.contactedVia === "whatsapp" && contactedVia === "email") {
      inquiry.contactedVia = "both";
    } else {
      inquiry.contactedVia = contactedVia;
    }

    await inquiry.save();

    return res.json({
      success: true,
      message: "Inquiry marked as Contacted.",
      data: inquiry,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
*/

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

// In-memory rate limiting map (IP -> timestamp)
const recentSubmissions = new Map();

// Helper to sanitize strings
const sanitize = (str) => {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[<>]/g, "");
};

// Check if MongoDB is connected & ready
const isMongoLive = () => mongoose.connection && mongoose.connection.readyState === 1;

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

    // Clean old entries from map periodically
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

    console.log(`📥 [INQUIRY] New lead saved: ${fullName} (${program} - ${plan}) [ID: ${finalRecord._id || finalRecord.id}]`);

    return res.status(201).json({
      success: true,
      message: "Your inquiry has been received! Our team will contact you shortly.",
      inquiry: {
        id: finalRecord._id || finalRecord.id,
        fullName: finalRecord.fullName,
        email: finalRecord.email,
        phone: finalRecord.phone,
        program: finalRecord.program,
        plan: finalRecord.plan,
        status: finalRecord.status,
        createdAt: finalRecord.createdAt,
      },
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

    // Update in localDb
    const updatedLocal = updateLocalInquiry(id, updateFields);

    // Update in MongoDB if connected
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

    const deletedLocal = deleteLocalInquiry(id);

    if (isMongoLive()) {
      try {
        await Inquiry.findByIdAndDelete(id);
      } catch {}
    }

    if (!deletedLocal) {
      return res.status(404).json({ success: false, message: "Inquiry not found." });
    }

    return res.json({ success: true, message: "Inquiry deleted successfully." });
  } catch (error) {
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

    // Build Email Transporter
    const isSmtpConfigured =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (!isSmtpConfigured) {
      console.warn("⚠️ [INQUIRY] SMTP credentials not set in .env. Returning fallback guidance.");
      return res.json({
        success: false,
        smtpConfigured: false,
        fallbackMailto: `mailto:${toEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message || "")}`,
        message: "SMTP is not fully configured in .env. A mailto: link was generated as a fallback.",
        data: { ...inquiry, ...updateData },
      });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

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

// ================= ADMIN: MARK INQUIRY AS CONTACTED (FOR WHATSAPP TRACKING) =================
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
