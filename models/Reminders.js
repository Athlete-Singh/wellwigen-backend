import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: false,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    email: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      default: "Your Wellwigen Reminder",
    },
    message: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      enum: ["email", "push", "sms"],
      default: "email",
    },
    type: {
      type: String,
      default: "subscription_expiry_3day",
    },
    dueAt: {
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

reminderSchema.index({ subscriptionId: 1, type: 1, dueAt: 1, channel: 1 });

const Reminder = mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
export default Reminder;