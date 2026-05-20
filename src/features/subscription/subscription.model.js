import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
    },
    plan: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "quarterly", "annual"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "expired", "cancelled", "pending"],
      default: "pending",
      index: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    nextRenewalDate: { type: Date },
    razorpaySubscriptionId: { type: String },
    razorpayCustomerId: { type: String },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    pausedAt: { type: Date },
    cancelledAt: { type: Date },
    pauseCount: {
      type: Number,
      default: 0,
    },
    // For Family Shield / Total Wellness plan
    members: [
      {
        name: String,
        dob: Date,
        relation: String,
      },
    ],
  },
  { timestamps: true }
);

// Indexes for fast querying
subscriptionSchema.index({ userId: 1, status: 1 });

export default mongoose.model("Subscription", subscriptionSchema);
