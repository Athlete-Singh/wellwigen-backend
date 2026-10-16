import nodemailer from "nodemailer";
import { notifyAdminWhatsApp } from "../services/whatsapp.js";

/**
 * Sends credentials to the approved provider.
 * Falls back to Ethereal Mail if no SMTP environment variables are defined.
 * 
 * @param {string} toEmail - The recipient's email address
 * @param {string} password - The cleartext temporary password
 * @param {string} providerType - The role/type of the provider (e.g. DOCTOR, LAB)
 * @param {string} businessName - The provider's business name
 */
export const sendProviderApprovalEmail = async (toEmail, password, providerType, businessName) => {
  try {
    let transporter;
    const isSmtpConfigured =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (isSmtpConfigured) {
      console.log("📨 [EMAIL] Using configured SMTP settings to send email.");
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      console.log("🧪 [EMAIL] No SMTP settings found in env. Setting up Ethereal Mail test account...");
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const loginUrl = process.env.FRONTEND_URL 
      ? `${process.env.FRONTEND_URL.split(",")[0]}/vendor/login`
      : "http://localhost:5177/vendor/login";

    const mailOptions = {
      from: `"Wellwigen Integrated Health Ecosystem" <no-reply@wellwigen.com>`,
      to: toEmail,
      subject: "🎉 Wellwigen Portal Application APPROVED!",
      text: `Hello ${businessName},\n\nCongratulations! Your application to join Wellwigen as a ${providerType} has been approved by our administrators.\n\nHere are your access details to the secure provider workspace portal:\n\nLogin Email: ${toEmail}\nTemporary Password: ${password}\nLogin Portal: ${loginUrl}\n\nLogin Instructions:\n1. Click the link above to navigate to the Provider Login.\n2. Sign in using your email and temporary password.\n3. We highly recommend changing your password from your Account Profile screen once logged in.\n\nBest Regards,\nThe Wellwigen Admin Team`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; padding: 12px 24px; background-color: #009688; border-radius: 12px; color: #ffffff; font-weight: bold; font-size: 20px; letter-spacing: 0.5px;">
              Wellwigen Ecosystem
            </div>
          </div>
          
          <h2 style="color: #0f172a; text-align: center; margin-bottom: 24px;">🎉 Application Approved!</h2>
          
          <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
            Hello <strong>${businessName}</strong>,
          </p>
          
          <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
            Congratulations! Your application to join the Wellwigen network as a <strong>${providerType}</strong> has been officially approved by our administrators. Your portal workspace is now ready.
          </p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
            <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Portal Workspace Credentials</p>
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 140px;"><strong>Login Email:</strong></td>
                <td style="padding: 6px 0; color: #0f172a;"><code>${toEmail}</code></td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Password:</strong></td>
                <td style="padding: 6px 0; color: #0f172a;"><span style="background-color: #fffbeb; border: 1px dashed #fcd34d; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #b45309;">${password}</span></td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Portal URL:</strong></td>
                <td style="padding: 6px 0; color: #009688;"><a href="${loginUrl}" style="color: #009688; text-decoration: none; font-weight: bold;">${loginUrl}</a></td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${loginUrl}" style="display: inline-block; padding: 14px 32px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.15);">
              Sign in to Workspace
            </a>
          </div>

          <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
            <p style="margin: 0 0 8px 0;"><strong>Security Note:</strong> Please do not share this temporary password with anyone. We highly recommend changing your password from your Account Profile screen immediately after signing in for the first time.</p>
            <p style="margin: 0;">This email was sent automatically. Please do not reply directly to this message.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Approval email sent successfully. Message ID: ${info.messageId}`);
    
    if (!isSmtpConfigured) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log("\n=======================================================");
      console.log("💌 [EMAIL PREVIEW] Open the URL below to view the email:");
      console.log(`🔗 ${previewUrl}`);
      console.log("=======================================================\n");
    }
    return info;
  } catch (err) {
    console.error("❌ [EMAIL] Error occurred while sending email:", err);
  }
};

/**
 * Sends a contact form query to the wellwigen gmail.
 * 
 * @param {string} name - The sender's name
 * @param {string} email - The sender's email address
 * @param {string} phone - The sender's phone
 * @param {string} company - The sender's company
 * @param {string} subject - The subject of the query
 * @param {string} message - The query message
 * @param {string} date - Date and time of the submission
 * @param {string} ip - Sender IP address
 */
export const sendContactEmail = async (name, email, phone, company, subject, message, date, ip) => {
  try {
    let transporter;
    const isSmtpConfigured =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (isSmtpConfigured) {
      console.log("📨 [EMAIL] Using configured SMTP settings to send contact email.");
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      console.log("🧪 [EMAIL] No SMTP settings found in env. Setting up Ethereal Mail test account...");
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const mailOptions = {
      from: `"Wellwigen Contact Form" <no-reply@wellwigen.com>`,
      to: "wellwigen@gmail.com",
      replyTo: email,
      subject: `New Contact Form Query: ${subject}`,
      text: `You have received a new query from the contact form.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nCompany: ${company || 'N/A'}\nDate: ${date}\nIP: ${ip}\nSubject: ${subject}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #009688; padding-bottom: 10px;">New Contact Query</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
          <p><strong>Company:</strong> ${company || 'N/A'}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 20px;">
            <p style="margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            <p style="margin: 0;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 0;"><strong>Sender IP:</strong> ${ip}</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Contact email sent successfully. Message ID: ${info.messageId}`);

    // Alert Superadmin on WhatsApp (+91 9598506627)
    notifyAdminWhatsApp({
      title: "NEW CONTACT FORM QUERY",
      message: `👤 Sender: ${name}\n✉️ Email: ${email}\n📞 Phone: ${phone || 'N/A'}\n🏢 Company: ${company || 'N/A'}\n📌 Subject: ${subject}\n\n💬 Message:\n"${message}"`,
      link: "https://wellwigen.com/admin",
    }).catch(() => {});
    
    if (!isSmtpConfigured) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log("\n=======================================================");
      console.log("💌 [EMAIL PREVIEW] Open the URL below to view the contact email:");
      console.log(`🔗 ${previewUrl}`);
      console.log("=======================================================\n");
    }
    return info;
  } catch (err) {
    console.error("❌ [EMAIL] Error occurred while sending contact email:", err);
    throw err;
  }
};

/**
 * Escapes special HTML characters to prevent XSS / formatting corruption
 */
const escapeHtml = (str) => {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/**
 * Sends a 3-day subscription expiry reminder email to the client.
 * Uses configured SMTP with fallback to Ethereal Mail for dev/testing.
 * 
 * @param {Object} params
 * @param {string} params.toEmail - Client email address
 * @param {string} [params.clientName] - Client name
 * @param {Date|string} params.expiryDate - The subscription endDate
 * @param {string} [params.planName] - Name of the plan (e.g. Total Wellness)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export const sendSubscriptionExpiryEmail = async ({ toEmail, clientName, expiryDate, planName }) => {
  try {
    if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
      return { success: false, error: "Invalid recipient email" };
    }

    let transporter;
    const isSmtpConfigured =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (isSmtpConfigured) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const safeName = (clientName && typeof clientName === "string" && clientName.trim())
      ? clientName.trim()
      : "Valued Client";
    const escapedName = escapeHtml(safeName);

    // Format expiry date in Asia/Kolkata timezone
    const dateObj = new Date(expiryDate);
    const formattedDate = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : String(expiryDate);

    const safePlan = (planName && typeof planName === "string" && planName.trim()) 
      ? escapeHtml(planName.trim()) 
      : "Wellwigen Subscription";

    const subject = "Your Wellwigen Subscription Expires in 3 Days";

    const textContent = `Hello ${safeName},

This is a friendly reminder that your Wellwigen subscription is scheduled to expire on ${formattedDate}, which is 3 days from now.

To continue enjoying our services without interruption, please renew your subscription before the expiry date.

Thank you for being a part of Wellwigen.

Best regards,
Team Wellwigen`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 20px; color: #1E293B;">
        <div style="border-bottom: 2px solid #F1F5F9; padding-bottom: 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: inline-block; padding: 8px 18px; background-color: #009688; border-radius: 10px; color: #ffffff; font-weight: 800; font-size: 18px; letter-spacing: 0.5px;">
            WELLWIGEN
          </div>
          <span style="font-size: 11px; font-weight: 700; color: #009688; text-transform: uppercase; letter-spacing: 1px;">Subscription Alert</span>
        </div>

        <h3 style="color: #0F172A; font-size: 20px; font-weight: 800; margin: 0 0 16px 0;">
          Subscription Expiry Reminder
        </h3>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
          Hello <strong>${escapedName}</strong>,
        </p>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
          This is a friendly reminder that your Wellwigen subscription is scheduled to expire on <strong>${escapeHtml(formattedDate)}</strong>, which is <strong>3 days from now</strong>.
        </p>

        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #009688; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748B; width: 140px;"><strong>Plan:</strong></td>
              <td style="padding: 6px 0; color: #0F172A; font-weight: 600;">${safePlan}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;"><strong>Expiry Date:</strong></td>
              <td style="padding: 6px 0; color: #D97706; font-weight: 700;">${escapeHtml(formattedDate)} (in 3 days)</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
          To continue enjoying our services without interruption, please renew your subscription before the expiry date.
        </p>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
          Thank you for being a part of Wellwigen.
        </p>

        <div style="border-top: 1px solid #F1F5F9; padding-top: 20px; font-size: 14px; color: #475569;">
          <p style="margin: 0 0 4px 0; font-weight: bold; color: #0F172A;">Best regards,</p>
          <p style="margin: 0; color: #009688; font-weight: 700;">Team Wellwigen</p>
        </div>
      </div>
    `;

    const fromAddress = process.env.SMTP_USER 
      ? `"Wellwigen" <${process.env.SMTP_USER}>` 
      : `"Wellwigen" <no-reply@wellwigen.com>`;

    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] 3-Day Expiry Reminder sent successfully. Message ID: ${info.messageId}`);

    if (!isSmtpConfigured) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`🔗 [EMAIL PREVIEW] ${previewUrl}`);
      }
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ [EMAIL] Failed to send subscription expiry reminder email:", err.message);
    return { success: false, error: err.message };
  }
};

