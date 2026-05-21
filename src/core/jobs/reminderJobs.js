import cron from 'node-cron';
import User from '../../features/user/user.model.js';
import Subscription from '../../features/subscription/subscription.model.js';
import Order from '../../features/automation/order.model.js';
import Provider from '../../features/provider/provider.model.js';
import { sendPushNotification } from '../utils/firebase.js';

/**
 * MEDICINE REMINDER JOB
 * Runs every day at 8:00 AM
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
  });

  console.log('💊 Medicine Reminder Job scheduled at 8:00 AM daily.');
};

/**
 * SUBSCRIPTION RENEWAL REMINDER JOB
 * Runs every day at 10:00 AM
 * Sends renewal reminders 3 days before subscription expires
 */
const startSubscriptionRenewalJob = () => {
  cron.schedule('0 10 * * *', async () => {
    console.log('🔄 [RENEWAL_JOB] Running subscription renewal reminder cron...');
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      threeDaysFromNow.setHours(23, 59, 59, 999);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      // Find subscriptions expiring in exactly ~3 days
      const expiringSubscriptions = await Subscription.find({
        status: 'active',
        endDate: {
          $gte: tomorrow,
          $lte: threeDaysFromNow
        }
      });

      let notifiedCount = 0;

      for (const sub of expiringSubscriptions) {
        try {
          const user = await User.findById(sub.userId);
          if (!user || !user.fcmTokens || user.fcmTokens.length === 0) continue;

          const daysLeft = Math.ceil(
            (new Date(sub.endDate) - new Date()) / (1000 * 60 * 60 * 24)
          );

          await sendPushNotification(
            user.fcmTokens,
            '🔄 Subscription Renewal Reminder',
            `Your Wellwigen subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew now to continue enjoying uninterrupted health services!`,
            {
              type: 'subscription_renewal',
              subscriptionId: sub._id.toString(),
              daysLeft: daysLeft.toString(),
              endDate: sub.endDate.toISOString()
            },
            { saveToDb: true, recipientId: user._id.toString(), role: 'user' }
          );
          notifiedCount++;
        } catch (userErr) {
          console.error(`⚠️ [RENEWAL_JOB] Failed to notify user ${sub.userId}:`, userErr.message);
        }
      }

      console.log(`✅ [RENEWAL_JOB] Renewal reminders sent to ${notifiedCount} users.`);
    } catch (err) {
      console.error('❌ [RENEWAL_JOB] Subscription renewal cron failed:', err);
    }
  });

  console.log('🔄 Subscription Renewal Job scheduled at 10:00 AM daily.');
};

/**
 * APPOINTMENT REMINDER JOB
 * Runs every day at 7:00 AM
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
  });

  console.log('📅 Appointment Reminder Job scheduled at 7:00 AM daily.');
};

/**
 * Start all reminder jobs
 */
export const startReminderJobs = () => {
  startMedicineReminderJob();
  startSubscriptionRenewalJob();
  startAppointmentReminderJob();
  console.log('✅ All reminder push notification jobs started.');
};
