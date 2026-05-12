import cron from "node-cron";
import Subscription from "../src/features/subscription/subscription.model.js";
import Order from "../src/features/automation/order.model.js";
import Provider from "../src/features/provider/provider.model.js";
import razorpayInstance from "../src/core/config/razorpay.js";
// import { ioInstance } from "../server.js"; // Removed direct import to fix circular dependency
let ioInstance = null;

/**
 * Initialize the socket instance for the cron module
 */
export const initSubscriptionSocket = (io) => {
  console.log("🔌 [CRON] Socket instance initialized");
  ioInstance = io;
};

/**
 * Helper: Get today's day name in "Asia/Kolkata" (e.g., "Mon", "Tue")
 */
const getTodayDayName = () => {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  });
};

/**
 * Helper: Get today's date at 00:00:00 in "Asia/Kolkata"
 */
const getTodayDateKolkata = () => {
  const dateStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }); // Returns YYYY-MM-DD
  return new Date(dateStr + "T00:00:00.000Z");
};

const getEndOfTodayKolkata = () => {
  const dateStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }); // Returns YYYY-MM-DD
  return new Date(dateStr + "T23:59:59.999Z");
};

// ============================================================
// Core Logic Functions (Exported for manual testing)
// ============================================================

export const runDailyOrderCreation = async () => {
  console.log("⚙️ [MANUAL/CRON] Running Daily Order Creation Logic...");
  try {
    const todayDay = getTodayDayName();
    const startOfToday = getTodayDateKolkata();
    const endOfToday = getEndOfTodayKolkata();

    const activeSubscriptions = await Subscription.find({
      status: { $in: ["active", "pending", "Active", "Pending"] }, 
      startDate: { $lte: endOfToday },
      endDate: { $gte: startOfToday },
    }).populate("userId");

    console.log(`🔍 [CRON] Found ${activeSubscriptions.length} subscriptions matching criteria.`);
    
    if (activeSubscriptions.length === 0) {
        console.log("⚠️ [CRON] No candidate subscriptions found matching current date criteria.");
    }

    // Relaxed vendor check for testing/flexibility: 
    // Orders will be created as 'pending' regardless of current vendor status.
    const hasActiveVendors = true; 
    console.log(`📡 Order generation mode: Open to all vendors.`);

    // Pre-generate orders for the next 7 days (Upcoming Orders)
    const daysToPredict = 7;
    
    for (const sub of activeSubscriptions) {
      const actualUserId = sub.userId?._id || sub.userId;

      if (!actualUserId) {
        console.log(`⚠️ [CRON] Skipping subscription ${sub._id} - No userId associated.`);
        continue;
      }
      
      for (let i = 0; i < daysToPredict; i++) {
        const targetDate = new Date(startOfToday);
        targetDate.setDate(startOfToday.getDate() + i);
        
        const existingOrder = await Order.findOne({
          userId: actualUserId,
          subscriptionId: sub._id,
          scheduledFor: {
            $gte: new Date(new Date(targetDate).setHours(0,0,0,0)),
            $lte: new Date(new Date(targetDate).setHours(23,59,59,999))
          },
        });

        if (!existingOrder) {
          if (!hasActiveVendors) {
            console.log(`⚠️ No active vendors! Skipping order for User ${actualUserId} on ${targetDate.toDateString()}`);
            continue;
          }

          const newOrder = await Order.create({
            userId: actualUserId,
            subscriptionId: sub._id,
            scheduledFor: new Date(targetDate.setHours(0,0,0,0)),
            status: "pending",
            type: "produce",
            items: [{ name: sub.plan, quantity: 1 }]
          });
          
          console.log(`✅ [CRON] Order ${newOrder._id} created for User ${actualUserId} on ${targetDate.toDateString()}`);

          // Notify vendors of the NEW order (even if it's for a future date)
          if (ioInstance) {
            const broadcastData = {
              id: newOrder._id,
              customer: sub.userId?.name || "Subscriber", 
              product: sub.plan || "Fresh Produce Box",
              date: targetDate.toLocaleDateString(),
              status: "Pending",
              type: i === 0 ? "Order" : "Upcoming"
            };

            console.log(`📡 Broadcasting ${broadcastData.type} order to all vendors: User ${actualUserId} | Date ${broadcastData.date}`);
            ioInstance.emit("newOrder", broadcastData);
          }
        }
      }
    }
    return { success: true, message: `Processed ${activeSubscriptions.length} subscriptions for the next ${daysToPredict} days.` };
  } catch (error) {
    console.error("❌ Error in runDailyOrderCreation:", error);
    return { success: false, error: error.message };
  }
};

export const runAutoUpdateOrderStatus = async () => {
  console.log("⚙️ [MANUAL/CRON] Running Auto-Update Order Status Logic...");
  try {
    const todayDate = getTodayDateKolkata();

    const result = await Order.updateMany(
      {
        scheduledFor: todayDate,
        status: "pending",
      },
      {
        $set: {
          status: "delivered",
          deliveredAt: new Date(),
        },
      }
    );

    console.log(`✅ Automatically marked ${result.modifiedCount} orders as 'delivered'`);
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    console.error("❌ Error in runAutoUpdateOrderStatus:", error);
    return { success: false, error: error.message };
  }
};

export const runSubscriptionExpiryCheck = async () => {
  console.log("⚙️ [MANUAL/CRON] Running Subscription Expiry Check Logic...");
  try {
    const currentTime = new Date();
    
    // 1. Check for Subscriptions Expiring Soon (e.g., within 2 minutes for testing)
    const warningWindow = new Date(currentTime);
    warningWindow.setMinutes(warningWindow.getMinutes() + 2);

    const expiringSoonSubs = await Subscription.find({
      status: "active",
      endDate: { $gt: currentTime, $lte: warningWindow }
    });

    if (expiringSoonSubs.length > 0) {
      console.log(`⚠️ Found ${expiringSoonSubs.length} subscriptions expiring soon.`);
      if (ioInstance) {
        expiringSoonSubs.forEach(sub => {
          ioInstance.emit("subscriptionExpiringSoon", {
            userId: sub.userId,
            subscriptionId: sub._id,
            plan: sub.plan,
            endDate: sub.endDate,
            message: `Your ${sub.plan} subscription is expiring soon on ${new Date(sub.endDate).toLocaleDateString()}.`
          });
        });
      }
    }

    // 2. Handle Expired Subscriptions
    const expiredSubs = await Subscription.find({
      status: "active",
      endDate: { $lt: currentTime },
    });

    if (expiredSubs.length > 0) {
      console.log(`🛑 Found ${expiredSubs.length} expired subscriptions. Processing cancellations...`);

      for (const sub of expiredSubs) {
        try {
          // Cancel on Razorpay if applicable
          if (sub.razorpaySubscriptionId) {
             await razorpayInstance.subscriptions.cancel(sub.razorpaySubscriptionId);
             console.log(`✅ Cancelled Razorpay subscription: ${sub.razorpaySubscriptionId}`);
          }
        } catch (rzpErr) {
          console.error(`❌ Failed to cancel Razorpay subscription for ${sub._id}:`, rzpErr.message);
          // We still continue to mark it expired locally
        }

        // Update local status
        sub.status = "expired";
        await sub.save();

        // Notify user via Socket
        if (ioInstance) {
          ioInstance.emit("subscriptionExpired", {
            userId: sub.userId,
            subscriptionId: sub._id,
            plan: sub.plan,
            message: `Your ${sub.plan} subscription has expired. Delivery services have been paused.`
          });
        }
      }
      console.log(`✅ Successfully processed ${expiredSubs.length} expired subscriptions.`);
    } else {
       console.log(`✅ No expired subscriptions found today.`);
    }

    return { success: true, expiredCount: expiredSubs.length, expiringSoonCount: expiringSoonSubs.length };
  } catch (error) {
    console.error("❌ Error in runSubscriptionExpiryCheck:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Logic: Find all pending lab tests and remind lab providers via socket
 */
export const runLabReminders = async () => {
  console.log("🔔 [CRON] Checking for pending lab tests to remind providers...");
  try {
    const pendingTests = await Order.find({ 
      type: "lab_test", 
      status: { $in: ["pending", "assigned"] } 
    }).populate("userId");
    
    if (pendingTests.length === 0) {
      console.log("✅ No pending lab tests requiring reminders.");
      return;
    }

    console.log(`📡 Re-broadcasting ${pendingTests.length} pending lab tests to all labs...`);
    
    for (const test of pendingTests) {
      if (ioInstance) {
        ioInstance.emit("labReminder", {
          id: test._id,
          customer: test.userId?.name || "Patient",
          testName: test.items?.[0]?.name || "Diagnostic Panel",
          date: new Date(test.scheduledFor).toLocaleDateString(),
          status: test.status === "pending" ? "Scheduled" : "In Progress",
          message: `Reminder: Lab test for ${test.userId?.name || "Patient"} is scheduled.`
        });
      }
    }
  } catch (error) {
    console.error("❌ Error in runLabReminders:", error);
  }
};

/**
 * Logic: Find all pending produce orders and remind vendor providers via socket
 */
export const runVendorReminders = async () => {
  console.log("🔔 [CRON] Checking for pending vendor orders to remind providers...");
  try {
    const pendingOrders = await Order.find({ 
      type: "produce", 
      status: "pending" 
    }).populate("userId");
    
    if (pendingOrders.length === 0) {
      console.log("✅ No pending vendor orders requiring reminders.");
      return;
    }

    console.log(`📡 Re-broadcasting ${pendingOrders.length} pending vendor orders to all vendors...`);
    
    for (const order of pendingOrders) {
      if (ioInstance) {
        ioInstance.emit("vendorReminder", {
          id: order._id,
          customer: order.userId?.name || "Subscriber",
          product: order.items?.[0]?.name || "Wellness Box",
          date: new Date(order.scheduledFor).toLocaleDateString(),
          status: "Pending",
          message: `Reminder: Produce delivery for ${order.userId?.name || "Subscriber"} is pending.`
        });
      }
    }
  } catch (error) {
    console.error("❌ Error in runVendorReminders:", error);
  }
};

// ============================================================
// Cron Job Registrations
// ============================================================

export const dailyOrderCreationTask = cron.schedule("*/3 * * * *", runDailyOrderCreation, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

export const autoUpdateOrderStatusTask = cron.schedule("0 20 * * *", runAutoUpdateOrderStatus, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

export const subscriptionExpiryCheckTask = cron.schedule("*/3 * * * *", runSubscriptionExpiryCheck, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

export const vendorReminderTask = cron.schedule("*/3 * * * *", runVendorReminders, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

export const labReminderTask = cron.schedule("*/3 * * * *", runLabReminders, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

console.log("🚀 [SYSTEM] Subscription Automation Cron Jobs Initialized");
