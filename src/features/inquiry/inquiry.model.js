import mongoose from "mongoose";

const inquirySchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      trim: true,
      lowercase: true,
    },
    fitnessGoal: {
      type: String,
      trim: true,
      default: "",
    },
    program: {
      type: String,
      trim: true,
      default: "General Inquiry",
    },
    plan: {
      type: String,
      trim: true,
      default: "",
    },
    preferredTiming: {
      type: String,
      trim: true,
      default: "",
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["New", "Contacted", "Interested", "Converted", "Closed"],
      default: "New",
      index: true,
    },
    adminNotes: {
      type: String,
      default: "",
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    contactedVia: {
      type: String,
      enum: ["none", "email", "whatsapp", "both"],
      default: "none",
    },
    ip: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Helpful index for sorting & filtering by date and status
inquirySchema.index({ createdAt: -1 });

const Inquiry = mongoose.model("Inquiry", inquirySchema);

export default Inquiry;
