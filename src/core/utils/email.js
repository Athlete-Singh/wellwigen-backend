import nodemailer from "nodemailer";

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
