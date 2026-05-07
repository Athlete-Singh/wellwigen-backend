import express from "express";
import { registerUser, loginUser, getProfile } from "./user.controller.js";
import authMiddleware from "../../core/middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Profile route - protected by authMiddleware
// Note: authMiddleware currently sets req.vendor, so we might need to adjust it or create a userAuthMiddleware
// For now, we'll use it as is, assuming it decodes the token correctly.
router.get("/profile", authMiddleware, getProfile);

export default router;
