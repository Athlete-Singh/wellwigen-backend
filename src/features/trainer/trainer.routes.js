import express from "express";
import {
  getAdminTrainers,
  getAdminTrainerById,
  updateTrainerStatus,
  deleteTrainer,
  getApprovedTrainers,
  registerTrainer,
  submitOnboarding,
  getTrainerStatus,
  updateTrainerProfile,
  assignCoachToTarget,
  getTrainerAssignments,
  triggerCoachAssignmentCronManually,
} from "./trainer.controller.js";

// Router for admin endpoints (/api/admin/trainers)
export const adminTrainerRouter = express.Router();
adminTrainerRouter.get("/", getAdminTrainers);
adminTrainerRouter.get("/:id", getAdminTrainerById);
adminTrainerRouter.patch("/:id/status", updateTrainerStatus);
adminTrainerRouter.delete("/:id", deleteTrainer);
adminTrainerRouter.post("/assign", assignCoachToTarget);

// Router for public/trainer endpoints (/api/trainers)
export const trainerRouter = express.Router();
trainerRouter.get("/approved", getApprovedTrainers);
trainerRouter.post("/register", registerTrainer);
trainerRouter.post("/submit-onboarding", submitOnboarding);
trainerRouter.get("/status", getTrainerStatus);
trainerRouter.patch("/profile", updateTrainerProfile);
trainerRouter.post("/assign", assignCoachToTarget);
trainerRouter.get("/assignments", getTrainerAssignments);
trainerRouter.post("/assignments/run-cron", triggerCoachAssignmentCronManually);

export default { adminTrainerRouter, trainerRouter };
