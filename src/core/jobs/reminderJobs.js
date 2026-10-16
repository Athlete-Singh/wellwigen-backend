import cron from 'node-cron';
import User from '../../features/user/user.model.js';
import Subscription from '../../features/subscription/subscription.model.js';
import Order from '../../features/automation/order.model.js';
import Provider from '../../features/provider/provider.model.js';
import { sendPushNotification } from '../utils/firebase.js';
import { sendSubscriptionExpiryEmail } from '../utils/email.js';
import Reminder from '../../../models/Reminders.js';

/**
 * Calculates the exact 24-hour UTC window for a target calendar day in "Asia/Kolkata".
 * Exactly daysAhead (default 3) days from referenceDate.
 * 
 * @param {Date} [referenceDate=new Date()]
 * @param {number} [daysAhead=3]
 * @returns {{ targetDateStr: string, startOfTarget: Date, endOfTarget: Date }}
 */
export const getTargetExpiryWindowKolkata = (referenceDate = new Date(), daysAhead = 3) => {
  const kolkataDateStr = referenceDate.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }); // Returns "YYYY-MM-DD"
  const [y, m, d] = kolkataDateStr.split("-").map(Number);

  // Exact calendar day calculation handling month/year rollovers cleanly
  const targetDate = new Date(Date.UTC(y, m - 1, d + daysAhead));
  const targetDateStr = targetDate.toISOString().split("T")[0]; // "YYYY-MM-DD"

  // In Asia/Kolkata (UTC +05:30):
  // Calendar day starts at 00:00:00.000 IST and ends at 23:59:59.999 IST
  const startOfTarget = new Date(`${targetDateStr}T00:00:00.000+05:30`);
  const endOfTarget = new Date(`${targetDateStr}T23:59:59.999+05:30`);

  return {
    targetDateStr,
    startOfTarget,
    endOfTarget,
  };
};

/**
 * MEDICINE REMINDER JOB
 * Runs every day at 8:00 AM (Asia/Kolkata)
 * Sends a daily medicine reminder to users with active subscriptions
 */
const startMedicineReminderJob = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('💊 [REMINDER_JOB] Running daily medicine reminder cron...');
    try {
      // Find all active subscriptions
      const activeSubscriptions = await Subscription.find({
        status: 'active',
        endDate: { $gte: new Date() }
      });

      let notifiedCount = 0;

      for (const sub of activeSubscriptions) {
        try {
          const user = await User.findById(sub.userId);
          if (!user || !user.fcmTokens || user.fcmTokens.length === 0) continue;

          await sendPushNotification(
            user.fcmTokens,
            '💊 Medicine Reminder',
            `Good morning ${user.name || 'there'}! Time to take your medicines. Stay healthy with Wellwigen!`,
            {
              type: 'medicine_reminder',
              subscriptionId: sub._id.toString(),
              timestamp: new Date().toISOString()
            },
            { saveToDb: true, recipientId: user._id.toString(), role: 'user' }
          );
          notifiedCount++;
        } catch (userErr) {
          console.error(`⚠️ [REMINDER_JOB] Failed to notify user ${sub.userId}:`, userErr.message);
        }
      }

      console.log(`✅ [REMINDER_JOB] Medicine reminders sent to ${notifiedCount} users.`);
    } catch (err) {
      console.error('❌ [REMINDER_JOB] Medicine reminder cron failed:', err);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  console.log('💊 Medicine Reminder Job scheduled at 8:00 AM daily (Asia/Kolkata).');
};

// Global in-memory lock to prevent overlapping executions
let isRenewalJobRunning = false;

/**
 * CORE LOGIC: Process 3-Day Subscription Expiry Reminders
 * 
 * - Selects subscriptions expiring in exactly 3 calendar days in Asia/Kolkata.
 * - Sends BOTH Push Notification (if FCM tokens exist) AND Email.
 * - Push and Email are independent; failure in one does not block the other.
 * - Idempotency: Reminders are tracked by targetEndDate to avoid duplicate reminders.
 * - Renewal safe: If a subscription renews and endDate changes, it becomes eligible again.
 * - Atomic persistence & isolated per-subscription error handling.
 * 
 * @param {Object} [options]
 * @param {Date} [options.referenceDate=new Date()]
 * @param {boolean} [options.force=false]
 * @returns {Promise<{ success: boolean, results?: Object, error?: string }>}
 */
export const processSubscriptionRenewalReminders = async ({ referenceDate = new Date(), force = false } = {}) => {
  if (isRenewalJobRunning) {
    console.warn('⚠️ [RENEWAL_JOB] Previous execution still in progress. Skipping overlapping run.');
    return { success: false, reason: 'concurrency_lock' };
  }

  isRenewalJobRunning = true;
  console.log('🔄 [RENEWAL_JOB] Starting automated 3-day subscription expiry reminder processing...');

  const results = {
    evaluatedCount: 0,
    emailSentCount: 0,
    emailFailedCount: 0,
    emailSkippedCount: 0,
    pushSentCount: 0,
    pushFailedCount: 0,
    pushSkippedCount: 0,
  };

  try {
    const { targetDateStr, startOfTarget, endOfTarget } = getTargetExpiryWindowKolkata(referenceDate, 3);
    console.log(`🎯 [RENEWAL_JOB] Target expiry calendar date: ${targetDateStr} (Window: ${startOfTarget.toISOString()} to ${endOfTarget.toISOString()})`);

    // Find active subscriptions expiring strictly on the target date (3 calendar days away)
    const expiringSubscriptions = await Subscription.find({
      status: 'active',
      endDate: {
        $gte: startOfTarget,
        $lte: endOfTarget,
      },
    });

    results.evaluatedCount = expiringSubscriptions.length;
    console.log(`🔍 [RENEWAL_JOB] Found ${expiringSubscriptions.length} subscriptions expiring on target date.`);

    for (const sub of expiringSubscriptions) {
      try {
        const subIdStr = sub._id.toString();
        const currentEndDate = new Date(sub.endDate);

        // Check if reminder was already sent for this exact subscription cycle / endDate
        const isSameTarget =
          sub.renewalReminder?.targetEndDate &&
          new Date(sub.renewalReminder.targetEndDate).getTime() === currentEndDate.getTime();

        const emailAlreadySent = isSameTarget && sub.renewalReminder?.emailStatus === 'sent';
        const pushAlreadySentOrSkipped =
          isSameTarget &&
          (sub.renewalReminder?.pushStatus === 'sent' || sub.renewalReminder?.pushStatus === 'skipped');

        if (!force && emailAlreadySent && pushAlreadySentOrSkipped) {
          console.log(`⏩ [RENEWAL_JOB] Subscription ${subIdStr} already notified for expiry ${targetDateStr}. Skipping.`);
          continue;
        }

        // Retrieve user
        const user = await User.findById(sub.userId);
        if (!user) {
          console.warn(`⚠️ [RENEWAL_JOB] User not found for subscription ${subIdStr} (userId: ${sub.userId}).`);
          continue;
        }

        const clientName = user.name || 'Valued Member';
        const clientEmail = user.email;
        const formattedExpiryDate = currentEndDate.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        let pushStatus = sub.renewalReminder?.pushStatus || 'pending';
        let pushSentAt = sub.renewalReminder?.pushSentAt || null;
        let pushError = null;

        let emailStatus = sub.renewalReminder?.emailStatus || 'pending';
        let emailSentAt = sub.renewalReminder?.emailSentAt || null;
        let emailError = null;

        // 1. PUSH NOTIFICATION DELIVERY (attempted if not already sent/skipped)
        if (force || !pushAlreadySentOrSkipped) {
          if (!user.fcmTokens || user.fcmTokens.length === 0) {
            pushStatus = 'skipped';
            results.pushSkippedCount++;
            console.log(`ℹ️ [RENEWAL_JOB] User has no registered FCM tokens. Skipping push delivery for sub ${subIdStr}.`);
          } else {
            try {
              const pushResponse = await sendPushNotification(
                user.fcmTokens,
                'Wellwigen Subscription Renewal Reminder',
                `Your Wellwigen subscription expires in 3 days, on ${formattedExpiryDate}. Renew it to continue enjoying our services.`,
                {
                  type: 'subscription_renewal',
                  subscriptionId: subIdStr,
                  daysLeft: '3',
                  endDate: currentEndDate.toISOString(),
                },
                { saveToDb: true, recipientId: user._id.toString(), role: 'user' }
              );

              if (pushResponse && pushResponse.success) {
                pushStatus = 'sent';
                pushSentAt = new Date();
                results.pushSentCount++;
                console.log(`📲 [RENEWAL_JOB] Push notification sent for subscription ${subIdStr}.`);
              } else {
                pushStatus = 'failed';
                pushError = pushResponse?.error || 'Push delivery failed';
                results.pushFailedCount++;
                console.warn(`⚠️ [RENEWAL_JOB] Push notification failed for sub ${subIdStr}: ${pushError}`);
              }
            } catch (pErr) {
              pushStatus = 'failed';
              pushError = pErr.message;
              results.pushFailedCount++;
              console.error(`❌ [RENEWAL_JOB] Error sending push for sub ${subIdStr}: ${pErr.message}`);
            }
          }
        } else {
          results.pushSkippedCount++;
        }

        // 2. EMAIL DELIVERY (attempted independently of push result)
        if (force || !emailAlreadySent) {
          if (!clientEmail || typeof clientEmail !== 'string' || !clientEmail.includes('@')) {
            emailStatus = 'failed';
            emailError = 'User has no valid email address on profile';
            results.emailFailedCount++;
            console.warn(`⚠️ [RENEWAL_JOB] No valid email address found for user ${user._id}.`);
          } else {
            try {
              const emailResponse = await sendSubscriptionExpiryEmail({
                toEmail: clientEmail,
                clientName,
                expiryDate: currentEndDate,
                planName: sub.plan,
              });

              if (emailResponse && emailResponse.success) {
                emailStatus = 'sent';
                emailSentAt = new Date();
                results.emailSentCount++;
                console.log(`📧 [RENEWAL_JOB] Expiry reminder email sent successfully for sub ${subIdStr}.`);

                // Record in Reminder collection
                try {
                  await Reminder.create({
                    subscriptionId: sub._id,
                    userId: user._id,
                    email: clientEmail,
                    subject: 'Your Wellwigen Subscription Expires in 3 Days',
                    message: `Subscription for ${sub.plan || 'Wellwigen'} expires on ${formattedExpiryDate} (in 3 days).`,
                    channel: 'email',
                    type: 'subscription_expiry_3day',
                    dueAt: currentEndDate,
                    sentAt: emailSentAt,
                    status: 'sent',
                  });
                } catch (recErr) {
                  console.warn(`⚠️ [RENEWAL_JOB] Could not record Reminder document: ${recErr.message}`);
                }
              } else {
                emailStatus = 'failed';
                emailError = emailResponse?.error || 'Email transport delivery failed';
                results.emailFailedCount++;
                console.warn(`⚠️ [RENEWAL_JOB] Email delivery failed for sub ${subIdStr}: ${emailError}`);

                try {
                  await Reminder.create({
                    subscriptionId: sub._id,
                    userId: user._id,
                    email: clientEmail,
                    subject: 'Your Wellwigen Subscription Expires in 3 Days',
                    message: `Subscription for ${sub.plan || 'Wellwigen'} expires on ${formattedExpiryDate} (in 3 days).`,
                    channel: 'email',
                    type: 'subscription_expiry_3day',
                    dueAt: currentEndDate,
                    status: 'failed',
                    error: emailError,
                  });
                } catch (recErr) {
                  // Non-blocking
                }
              }
            } catch (eErr) {
              emailStatus = 'failed';
              emailError = eErr.message;
              results.emailFailedCount++;
              console.error(`❌ [RENEWAL_JOB] Error sending email for sub ${subIdStr}: ${eErr.message}`);
            }
          }
        } else {
          results.emailSkippedCount++;
        }

        // 3. PERSIST TRACKING STATE ON SUBSCRIPTION
        const updateFields = {
          'renewalReminder.targetEndDate': currentEndDate,
          'renewalReminder.lastAttemptAt': new Date(),
        };

        if (emailStatus !== 'pending') {
          updateFields['renewalReminder.emailStatus'] = emailStatus;
          if (emailSentAt) updateFields['renewalReminder.emailSentAt'] = emailSentAt;
        }

        if (pushStatus !== 'pending') {
          updateFields['renewalReminder.pushStatus'] = pushStatus;
          if (pushSentAt) updateFields['renewalReminder.pushSentAt'] = pushSentAt;
        }

        if (emailError || pushError) {
          updateFields['renewalReminder.lastError'] = [emailError, pushError].filter(Boolean).join(' | ');
        }

        await Subscription.findByIdAndUpdate(sub._id, { $set: updateFields });

      } catch (subErr) {
        // Individual user failure does not abort processing for other subscriptions
        console.error(`❌ [RENEWAL_JOB] Unhandled failure processing subscription ${sub._id}: ${subErr.message}`);
      }
    }

    console.log(`✅ [RENEWAL_JOB] Subscription renewal reminder process completed:`, results);
    return { success: true, results };
  } catch (err) {
    console.error('❌ [RENEWAL_JOB] Subscription renewal reminder job encountered a fatal error:', err);
    return { success: false, error: err.message };
  } finally {
    isRenewalJobRunning = false;
  }
};

/**
 * SUBSCRIPTION RENEWAL REMINDER JOB
 * Runs every day at 10:00 AM (Asia/Kolkata)
 * Sends renewal reminders exactly 3 calendar days before subscription expires
 */
export const startSubscriptionRenewalJob = () => {
  cron.schedule('0 10 * * *', async () => {
    console.log('🔄 [RENEWAL_JOB] Running scheduled 10:00 AM IST subscription renewal reminder cron...');
    await processSubscriptionRenewalReminders();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  console.log('🔄 Subscription Renewal Job scheduled at 10:00 AM daily (Asia/Kolkata).');
};

/**
 * APPOINTMENT REMINDER JOB
 * Runs every day at 7:00 AM (Asia/Kolkata)
 * Sends reminder for orders/consultations scheduled for tomorrow
 */
const startAppointmentReminderJob = () => {
  cron.schedule('0 7 * * *', async () => {
    console.log('📅 [APPT_JOB] Running appointment reminder cron...');
    try {
      const tomorrowStart = new Date();
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);

      const upcomingOrders = await Order.find({
        status: { $in: ['pending', 'assigned', 'confirmed'] },
        scheduledFor: { $gte: tomorrowStart, $lte: tomorrowEnd }
      });

      let notifiedCount = 0;

      for (const order of upcomingOrders) {
        // Notify User
        try {
          const user = await User.findById(order.userId);
          if (user && user.fcmTokens && user.fcmTokens.length > 0) {
            await sendPushNotification(
              user.fcmTokens,
              '⏰ Appointment Reminder',
              `Reminder: You have an upcoming ${order.type || 'appointment'} scheduled for tomorrow.`,
              { type: 'appointment_reminder', orderId: order._id.toString() },
              { saveToDb: true, recipientId: user._id.toString(), role: 'user' }
            );
            notifiedCount++;
          }
        } catch (uErr) {
          console.error(`⚠️ [APPT_JOB] Failed to notify user for order ${order._id}`);
        }

        // Notify Provider if assigned
        try {
          if (order.providerId) {
            const provider = await Provider.findById(order.providerId);
            if (provider && provider.fcmTokens && provider.fcmTokens.length > 0) {
              await sendPushNotification(
                provider.fcmTokens,
                '⏰ Upcoming Appointment',
                `Reminder: You are assigned to an upcoming ${order.type || 'appointment'} scheduled for tomorrow.`,
                { type: 'appointment_reminder_provider', orderId: order._id.toString() },
                { saveToDb: true, recipientId: provider._id.toString(), role: 'provider' }
              );
            }
          }
        } catch (pErr) {
          console.error(`⚠️ [APPT_JOB] Failed to notify provider for order ${order._id}`);
        }
      }

      console.log(`✅ [APPT_JOB] Appointment reminders sent to ${notifiedCount} users.`);
    } catch (err) {
      console.error('❌ [APPT_JOB] Appointment reminder cron failed:', err);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  console.log('📅 Appointment Reminder Job scheduled at 7:00 AM daily (Asia/Kolkata).');
};

/**
 * Start all reminder jobs
 */
export const startReminderJobs = () => {
  startMedicineReminderJob();
  startSubscriptionRenewalJob();
  startAppointmentReminderJob();
  console.log('✅ All reminder jobs initialized (Medicine 8:00 AM, Renewal 10:00 AM, Appointment 7:00 AM IST).');
};

