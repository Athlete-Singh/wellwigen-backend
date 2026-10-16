import mongoose from "mongoose";

const coachAssignmentSchema = new mongoose.Schema(
  {
    assignmentType: {
      type: String,
      enum: ["client", "group"],
      default: "client",
      index: true,
    },
    targetId: {
      type: String,
      default: "",
    },
    targetName: {
      type: String,
      required: true,
      trim: true,
    },
    targetEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    targetPhone: {
      type: String,
      default: "",
      trim: true,
    },
    targetGoal: {
      type: String,
      default: "General Fitness",
      trim: true,
    },
    plan: {
      type: String,
      default: "Personal Training",
      trim: true,
    },
    totalSessions: {
      type: Number,
      default: 12,
    },
    coachId: {
      type: String,
      default: "",
      index: true,
    },
    coachName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    coachEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    coachPhone: {
      type: String,
      default: "",
      trim: true,
    },
    adminNotes: {
      type: String,
      default: "",
    },
    assignedBy: {
      type: String,
      default: "admin",
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    notificationStatus: {
      panel: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date, default: null },
        notificationId: { type: String, default: "" },
      },
      email: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date, default: null },
        error: { type: String, default: null },
      },
      whatsapp: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date, default: null },
        directUrl: { type: String, default: "" },
        error: { type: String, default: null },
      },
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

coachAssignmentSchema.index({ processed: 1, createdAt: 1 });
coachAssignmentSchema.index({ coachName: 1, coachEmail: 1 });

const CoachAssignment =
  mongoose.models.CoachAssignment ||
  mongoose.model("CoachAssignment", coachAssignmentSchema);

export default CoachAssignment;
