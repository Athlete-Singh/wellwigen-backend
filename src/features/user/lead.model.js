import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    program: {
      type: String,
      enum: ["Personal Training", "Group Classes", "General Inquiry"],
      default: "General Inquiry",
    },
    plan: {
      type: String,
      default: "",
    },
    fitnessGoal: {
      type: String,
      default: "",
    },
    preferredTime: {
      type: String,
      default: "",
    },
    company: {
      type: String,
      default: "",
    },
    subject: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    ip: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["new", "contacted", "converted", "closed"],
      default: "new",
    },
    source: {
      type: String,
      default: "landing_page_lead_modal",
    },
  },
  {
    timestamps: true,
  }
);

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
