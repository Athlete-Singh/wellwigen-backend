/**
 * WhatsApp Messaging Service for Wellwigen
 * Supports:
 * 1. Direct Click-to-Chat URL generation (works on Web & Mobile without API keys)
 * 2. Meta WhatsApp Cloud API (if configured in env)
 * 3. Twilio WhatsApp API (if configured in env)
 */

export const formatWhatsAppNumber = (phoneStr) => {
  if (!phoneStr) return "";
  let digits = String(phoneStr).replace(/\D/g, "");
  // If 10 digits (standard Indian mobile), prepend 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return digits;
};

/**
 * Generate a Click-to-Chat WhatsApp URL
 */
export const buildWhatsAppUrl = (phone, message) => {
  const cleanPhone = formatWhatsAppNumber(phone);
  const encodedMsg = encodeURIComponent(message || "");
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodedMsg}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
};

/**
 * Send an automated WhatsApp message to a customer
 * Dispatches via Meta Cloud API or Twilio if keys exist,
 * otherwise logs the generated instant action URL for the admin/system.
 */
export const sendAutomatedWhatsApp = async ({ recipientPhone, recipientName, program, plan, customMessage }) => {
  const cleanPhone = formatWhatsAppNumber(recipientPhone);
  
  const defaultText = customMessage || 
    `Hi ${recipientName || "there"}! Welcome to Wellwigen. We received your inquiry to join ${program || "our classes"}${plan ? ` (${plan})` : ""}. A master coach has been assigned to help you get started. When would you be available for a quick onboarding call?`;

  const waDirectUrl = buildWhatsAppUrl(cleanPhone, defaultText);

  // Check for Meta WhatsApp Cloud API credentials
  const metaToken = process.env.WHATSAPP_API_TOKEN;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (metaToken && metaPhoneId) {
    try {
      console.log(`📱 [WHATSAPP] Dispatching automated message to ${cleanPhone} via Meta Cloud API...`);
      const response = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${metaToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: defaultText },
        }),
      });
      const data = await response.json();
      if (response.ok) {
        console.log(`✅ [WHATSAPP] Message dispatched successfully:`, data);
        return { success: true, provider: "meta", data, directUrl: waDirectUrl };
      } else {
        console.warn(`⚠️ [WHATSAPP] Meta API returned error:`, data);
      }
    } catch (apiErr) {
      console.error(`❌ [WHATSAPP] Meta Cloud API call failed:`, apiErr.message);
    }
  }

  // Check for Twilio WhatsApp credentials
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

  if (twilioSid && twilioAuth && twilioFrom) {
    try {
      console.log(`📱 [WHATSAPP] Dispatching automated message to ${cleanPhone} via Twilio...`);
      const authHeader = Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64");
      const bodyParams = new URLSearchParams();
      bodyParams.append("From", twilioFrom);
      bodyParams.append("To", `whatsapp:+${cleanPhone}`);
      bodyParams.append("Body", defaultText);

      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams.toString(),
      });
      const twilioData = await twilioRes.json();
      if (twilioRes.ok) {
        console.log(`✅ [WHATSAPP] Twilio message dispatched:`, twilioData.sid);
        return { success: true, provider: "twilio", data: twilioData, directUrl: waDirectUrl };
      } else {
        console.warn(`⚠️ [WHATSAPP] Twilio returned error:`, twilioData);
      }
    } catch (twErr) {
      console.error(`❌ [WHATSAPP] Twilio call failed:`, twErr.message);
    }
  }

  console.log(`💬 [WHATSAPP] Generated 1-Click WhatsApp Direct URL for ${recipientName} (+${cleanPhone}):\n🔗 ${waDirectUrl}`);
  return {
    success: true,
    provider: "direct_link",
    directUrl: waDirectUrl,
    message: defaultText,
  };
};
