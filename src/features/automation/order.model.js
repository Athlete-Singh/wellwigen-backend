import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
    type: {
      type: String,
      enum: ["produce", "lab_test", "trainer_session", "doctor_followup", "medicine_refill"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "assigned", "accepted", "rejected", "in_progress", "out_for_delivery", "delivered", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    items: [
      {
        name: String,
        quantity: Number,
        unit: String,
        price: Number,
      },
    ],
    totalAmount: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    providerEarning: { type: Number, default: 0 },
    scheduledFor: { type: Date, index: true },
    acceptedAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    deliveryAddress: { type: Object },
    trackingUrl: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    review: { type: String },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
