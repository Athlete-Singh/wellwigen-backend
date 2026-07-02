import User from "./user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendContactEmail } from "../../core/utils/email.js";
import admin from "../../core/utils/firebase.js";

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      address,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      userId: user._id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const submitContactForm = async (req, res) => {
  try {
    const { name, email, phone, company, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const date = new Date().toISOString();

    // 1. Save to Firebase (Run asynchronously to prevent blocking)
    if (admin && admin.apps && admin.apps.length > 0) {
      const { FieldValue } = admin.firestore;
      admin.firestore().collection('messages').add({
        name,
        email,
        phone: phone || '',
        company: company || '',
        subject,
        message,
        ip,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
      }).catch(err => console.error("❌ Firebase save failed:", err));
    }

    // 2. Send email asynchronously so it doesn't block the response
    sendContactEmail(name, email, phone, company, subject, message, date, ip).catch(err => {
      console.error("❌ Background email sending failed:", err);
    });

    res.status(200).json({ success: true, message: "Contact email queued successfully" });
  } catch (error) {
    console.error("❌ Error in submitContactForm:", error);
    res.status(500).json({ success: false, message: "Failed to process request", error: error.message });
  }
};
