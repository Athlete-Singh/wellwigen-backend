import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    type: {
      type: String,
      enum: ["produce", "lab_test", "trainer_session", "doctor_followup", "medicine_refill"],
      required: true,
    },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "fortnightly", "monthly", "quarterly", "biannual", "annual"],
      required: true,
    },
    dayOfWeek: { type: Number, min: 0, max: 6 }, // For weekly
    dayOfMonth: { type: Number, min: 1, max: 31 }, // For monthly
    timeSlot: { type: String }, // e.g. "09:00"
    itemDetails: { type: Object }, // Flexible structure to hold ordered items
    isActive: { type: Boolean, default: true },
    nextRunAt: { type: Date },
    lastRunAt: { type: Date },
    totalRuns: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Schedule", scheduleSchema);
