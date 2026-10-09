import express from "express";
import { registerUser, loginUser, getProfile, submitContactForm, getLeads } from "./user.controller.js";
import authMiddleware from "../../core/middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Profile route - protected by authMiddleware
router.get("/profile", authMiddleware, getProfile);

// Contact / Lead form routes
router.post("/contact", submitContactForm);
router.get("/leads", getLeads);

export default router;
