import express from "express";
import {
  getAllPlans,
  getActivePlans,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlanStatus,
} from "./subscriptionPlan.controller.js";

const router = express.Router();

router.get("/", getAllPlans);
router.get("/active", getActivePlans);
router.post("/", createPlan);
router.put("/:id", updatePlan);
router.delete("/:id", deletePlan);
router.patch("/:id/status", togglePlanStatus);

export default router;
