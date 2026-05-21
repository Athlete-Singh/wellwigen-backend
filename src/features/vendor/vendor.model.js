import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: { type: String, required: true, unique: true },

    password: { type: String, required: true },

    // ✅ Store Details
    storeName: { type: String, required: true },
    storeAddress: { type: String, required: true },
    phone: { type: String, required: true },

    // ✅ Approval System (MOST IMPORTANT)
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    type: {
      type: String,
      enum: ["NUTRITION", "VENDOR", "DOCTOR", "LAB", "PHARMACY"],
      default: "VENDOR"
    },
    role: { type: String, default: "vendor" },
    fcmTokens: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", vendorSchema);