import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function testEmail() {
  try {
    console.log("Testing SMTP connection to:", process.env.SMTP_HOST);
    console.log("Using User:", process.env.SMTP_USER);
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    console.log("Verifying credentials...");
    await transporter.verify();
    console.log("✅ Credentials Verified Successfully!");

    console.log("Sending test email...");
    const info = await transporter.sendMail({
      from: `"Wellwigen System" <no-reply@wellwigen.com>`,
      to: process.env.SMTP_USER,
      subject: "Wellwigen SMTP Setup Verification",
      text: "If you are receiving this, your SMTP settings in .env are perfectly configured!",
    });

    console.log("✅ Email sent successfully! Message ID:", info.messageId);
  } catch (err) {
    console.error("❌ Email Test Failed:", err.message);
  }
}

testEmail();
