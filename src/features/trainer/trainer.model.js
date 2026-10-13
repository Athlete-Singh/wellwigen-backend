import mongoose from "mongoose";

// OLD CODE (commented by AI)
/*
const trainerSchema = new mongoose.Schema(
  {
    name: {
*/
// NEW CODE - Flexible _id supporting both String and ObjectId
const trainerSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.Mixed,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    id: {
      type: String,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // OLD CODE (commented by AI)
    /*
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    */
    // NEW CODE - Optional phone for backwards-compatibility with legacy records
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    specialty: {
      type: String,
      default: "",
    },
    passwordHash: {
      type: String,
    },
    city: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      default: "Male",
    },
    languages: {
      type: [String],
      default: ["English", "Hindi"],
    },
    specialization: {
      type: String,
      default: "Strength & Conditioning",
    },
    secondarySpecializations: {
      type: [String],
      default: [],
    },
    experience: {
      type: String,
      default: "3-5 Years",
    },
    // OLD CODE (commented by AI)
    /*
    certifications: {
      type: [String],
      default: [],
    },
    */
    // NEW CODE - Mixed certifications supporting both string array and object array
    certifications: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    institution: {
      type: String,
      default: "",
    },
    photoUrl: {
      type: String,
      default: "",
    },
    certificateUrl: {
      type: String,
      default: "",
    },
    certificateName: {
      type: String,
      default: "",
    },
    services: {
      personalTraining: { type: Boolean, default: true },
      groupClasses: { type: Boolean, default: true },
      oneOnOnePriceMonthly: { type: Number, default: 4999 },
      groupClassSeatPrice: { type: Number, default: 499 },
    },
    timeSlots: {
      type: [String],
      default: [
        "Morning (06:00 AM - 10:00 AM)",
        "Evening (05:00 PM - 09:00 PM)",
      ],
    },
    bio: {
      type: String,
      default: "",
    },
    videoUrl: {
      type: String,
      default: "",
    },
    instagram: {
      type: String,
      default: "",
    },
    linkedin: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["onboarding", "pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    applicationId: {
      type: String,
      unique: true,
      sparse: true,
    },
    rating: {
      type: Number,
      default: 4.9,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
  },
  // OLD CODE (commented by AI)
  // { timestamps: true }
  // NEW CODE
  { timestamps: true, strict: false }
);

export default mongoose.model("Trainer", trainerSchema);
