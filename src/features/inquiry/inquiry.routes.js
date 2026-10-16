import express from "express";
import {
  createInquiry,
  getInquiries,
  getInquiryById,
  updateInquiry,
  deleteInquiry,
  replyEmail,
  markContacted,
  convertToClient,
} from "./inquiry.controller.js";

const router = express.Router();

// Public endpoint - visitor submits lead from landing page
router.post("/", createInquiry);

// Admin endpoints - list, inspect, update, delete, reply
router.get("/", getInquiries);
router.get("/:id", getInquiryById);
router.patch("/:id", updateInquiry);
router.delete("/:id", deleteInquiry);
router.post("/:id/reply-email", replyEmail);
router.patch("/:id/contacted", markContacted);
router.post("/:id/contacted", markContacted);
router.patch("/:id/mark-contacted", markContacted);
router.post("/:id/mark-contacted", markContacted);
router.post("/:id/convert-to-client", convertToClient);
router.patch("/:id/convert-to-client", convertToClient);

export default router;
