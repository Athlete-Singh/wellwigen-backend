import nodemailer from "nodemailer";

/**
 * Creates and returns the appropriate Nodemailer transporter.
 * Uses Gmail SMTP with Port 465 (SSL/TLS) using GMAIL_USER and GMAIL_APP_PASSWORD.
 * Falls back to SMTP_USER / SMTP_PASS or Ethereal test account in development.
 */
const getTransporter = async () => {
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // true for 465 with SSL/TLS
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });
  }

  // Fallback for local development if credentials not yet configured
  if (process.env.NODE_ENV !== "production") {
    console.warn("⚠️ [EMAIL_SERVICE] GMAIL_USER/GMAIL_APP_PASSWORD not set. Creating Ethereal test account...");
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  throw new Error("Gmail SMTP credentials (GMAIL_USER, GMAIL_APP_PASSWORD) are not configured.");
};

/**
 * Sends a 6-digit Email Verification OTP to the recipient.
 * 
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email address
 * @param {string} params.otp - 6-digit one-time password
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
export const sendVerificationEmail = async ({ toEmail, otp }) => {
  try {
    const transporter = await getTransporter();
    const sender = process.env.GMAIL_USER || process.env.SMTP_USER || "no-reply@wellwigen.com";

    const subject = "Your Wellwigen Verification Code";
    const textContent = `Your verification code is ${otp}. It expires in 5 minutes. If you didn't request this, ignore this email.`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; color: #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; padding: 8px 20px; background-color: #009688; border-radius: 10px; color: #ffffff; font-weight: 800; font-size: 18px; letter-spacing: 0.5px;">
            WELLWIGEN
          </div>
        </div>
        <h2 style="color: #0f172a; text-align: center; margin: 0 0 12px 0; font-size: 20px; font-weight: 800;">Email Verification</h2>
        <p style="font-size: 14px; color: #475569; text-align: center; margin: 0 0 24px 0;">Use the 6-digit verification code below to verify your email address for your Wellwigen Provider application.</p>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; padding: 14px 32px; background-color: #f8fafc; border: 2px dashed #009688; border-radius: 12px; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #009688;">
            ${otp}
          </div>
        </div>

        <p style="font-size: 13px; color: #64748b; text-align: center; margin: 0 0 16px 0;">
          This code expires in <strong>5 minutes</strong>.
        </p>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          If you didn't request this verification code, you can safely ignore this email.
        </p>
        <div style="border-top: 1px solid #f1f5f9; margin-top: 24px; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
          &copy; ${new Date().getFullYear()} Wellwigen Health Ecosystem. All rights reserved.
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Wellwigen Health" <${sender}>`,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    if (process.env.NODE_ENV === "development") {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`🔗 [EMAIL_PREVIEW] ${previewUrl}`);
      }
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ [EMAIL_SERVICE] Failed to send verification email:", err.message);
    throw err;
  }
};

export default {
  sendVerificationEmail,
};
