import express from "express";
import {
  getAdminTrainers,
  getAdminTrainerById,
  updateTrainerStatus,
  getApprovedTrainers,
  registerTrainer,
  submitOnboarding,
  getTrainerStatus,
} from "./trainer.controller.js";

// Router for admin endpoints (/api/admin/trainers)
export const adminTrainerRouter = express.Router();
adminTrainerRouter.get("/", getAdminTrainers);
adminTrainerRouter.get("/:id", getAdminTrainerById);
adminTrainerRouter.patch("/:id/status", updateTrainerStatus);

// Router for public/trainer endpoints (/api/trainers)
export const trainerRouter = express.Router();
trainerRouter.get("/approved", getApprovedTrainers);
trainerRouter.post("/register", registerTrainer);
trainerRouter.post("/submit-onboarding", submitOnboarding);
trainerRouter.get("/status", getTrainerStatus);

export default { adminTrainerRouter, trainerRouter };
