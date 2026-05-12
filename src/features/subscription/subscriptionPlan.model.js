import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    prices: {
      monthly: { type: Number, required: true },
      quarterly: { type: Number, required: true },
      annual: { type: Number, required: true },
    },
    features: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    deliveryDays: {
      type: Number,
      default: 0, // Number of deliveries/sessions included
    },
    quantity: {
      type: Number,
      default: 0, // Total units/quantity
    },
    duration: {
      type: String,
      default: "1 Month", // Human readable duration
    },
    razorpayPlanIds: {
      monthly: { type: String },
      quarterly: { type: String },
      annual: { type: String },
    },
    tag: {
      type: String, // e.g., "Most Popular", "Best Value"
    },
  },
  { timestamps: true }
);

export default mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
