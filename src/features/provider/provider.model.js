import mongoose from "mongoose";

const providerSchema = new mongoose.Schema(
  {
    userId: { type: String },
    type: {
      type: String,
      enum: ["NUTRITION", "VENDOR", "DOCTOR", "LAB", "TRAINER", "PHARMACY"],
      required: true,
    },
    businessName: { type: String },
    ownerName: { type: String },
    phone: { type: String, sparse: true },
    email: { type: String, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    passwordHash: { type: String },
    companyType: { type: String, default: 'Individual' },
    experience: String,
    onboardingStep: { type: Number, default: 1 },

    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], index: "2dsphere" },
    },
    serviceRadiusKm: { type: Number, default: 10 },

    // Role Specific Qualifications
    specialization: String,
    consultationFee: Number,
    hospitalName: String,
    labCategory: String,
    homeCollection: String,
    shopCategory: String,
    gstNo: String,
    deliveryRadius: String,
    is24x7: String,
    pharmacistName: String,
    operatingHoursText: String,
    foodCategory: String,
    sourcing: String,
    deliveryType: String,
    dietaryFocus: String,

    // Licenses based on provider type
    licenseNumber: String,
    fssaiNo: String,
    nmcNo: String,
    nablNo: String,
    drugLicenseNo: String,

    documents: [
      {
        docType: String,
        fileUrl: String,
        verified: { type: Boolean, default: false },
      },
    ],

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: String,

    // Metrics
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    acceptanceRate: { type: Number, default: 100 },
    totalOrders: { type: Number, default: 0 },
    capacityLimit: { type: Number, default: 50 },
    currentLoad: { type: Number, default: 0 },

    bankDetails: {
      accountNo: String,
      ifsc: String,
      accountName: String,
    },

    operatingHours: {
      open: String,
      close: String, // e.g., "18:00"
      days: [String], // ["Monday", "Tuesday"]
    },
    fcmTokens: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("Provider", providerSchema);
