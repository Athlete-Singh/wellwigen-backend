import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory and file path
const DATA_DIR = path.resolve(__dirname, "../../../data");
const INQUIRIES_FILE = path.join(DATA_DIR, "inquiries.json");

// Ensure directory and file exist
const ensureFileExists = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(INQUIRIES_FILE)) {
      fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([], null, 2), "utf8");
    }
  } catch (err) {
    console.error("❌ [LOCAL_DB] Error ensuring data directory exists:", err);
  }
};

/**
 * Get all local inquiries
 */
export const getAllLocalInquiries = () => {
  try {
    ensureFileExists();
    const data = fs.readFileSync(INQUIRIES_FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("❌ [LOCAL_DB] Failed to read inquiries:", err.message);
    return [];
  }
};

/**
 * Find single local inquiry by ID
 */
export const findLocalInquiryById = (id) => {
  try {
    const list = getAllLocalInquiries();
    return list.find((item) => String(item._id || item.id) === String(id)) || null;
  } catch (err) {
    console.error("❌ [LOCAL_DB] Failed to find inquiry by id:", err.message);
    return null;
  }
};

/**
 * Save a new inquiry to local JSON database
 */
export const saveLocalInquiry = (inquiryData) => {
  try {
    ensureFileExists();
    const list = getAllLocalInquiries();
    
    // Create new record with unique ID and timestamps
    const newRecord = {
      _id: "loc_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      id: "loc_" + Date.now(),
      fullName: inquiryData.fullName || inquiryData.name || "",
      email: inquiryData.email || "",
      phone: inquiryData.phone || "",
      program: inquiryData.program || "General Inquiry",
      plan: inquiryData.plan || "",
      fitnessGoal: inquiryData.fitnessGoal || "",
      preferredTiming: inquiryData.preferredTiming || inquiryData.preferredTime || "",
      message: inquiryData.message || "",
      status: inquiryData.status || "New",
      adminNotes: inquiryData.adminNotes || "",
      contactedVia: inquiryData.contactedVia || "none",
      lastContactedAt: inquiryData.lastContactedAt || null,
      ip: inquiryData.ip || "unknown",
      createdAt: inquiryData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    list.unshift(newRecord);
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2), "utf8");
    return newRecord;
  } catch (err) {
    console.error("❌ [LOCAL_DB] Failed to save inquiry:", err.message);
    return {
      _id: "tmp_" + Date.now(),
      ...inquiryData,
      createdAt: new Date().toISOString(),
    };
  }
};

/**
 * Update existing local inquiry
 */
export const updateLocalInquiry = (id, updates) => {
  try {
    ensureFileExists();
    const list = getAllLocalInquiries();
    const index = list.findIndex((item) => String(item._id || item.id) === String(id));

    if (index === -1) return null;

    list[index] = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(list, null, 2), "utf8");
    return list[index];
  } catch (err) {
    console.error("❌ [LOCAL_DB] Failed to update inquiry:", err.message);
    return null;
  }
};

/**
 * Delete a local inquiry
 */
export const deleteLocalInquiry = (id) => {
  try {
    ensureFileExists();
    const list = getAllLocalInquiries();
    const filtered = list.filter((item) => String(item._id || item.id) !== String(id));

    if (filtered.length === list.length) {
      return false;
    }

    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(filtered, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("❌ [LOCAL_DB] Failed to delete inquiry:", err.message);
    return false;
  }
};
