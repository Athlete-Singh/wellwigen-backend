import cron from "node-cron";
import Subscription from "../src/features/subscription/subscription.model.js";
import Order from "../src/features/automation/order.model.js";
import { ioInstance } from "../server.js";

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
  return new Date(dateStr);
};

// ============================================================
// Core Logic Functions (Exported for manual testing)
// ============================================================

export const runDailyOrderCreation = async () => {
  console.log("⚙️ [MANUAL/CRON] Running Daily Order Creation Logic...");
  try {
    const todayDay = getTodayDayName();
    const todayDate = getTodayDateKolkata();

    const activeSubscriptions = await Subscription.find({
      status: "active",
      deliveryDays: todayDay,
      startDate: { $lte: todayDate },
      endDate: { $gte: todayDate },
    });

    console.log(`🔍 Found ${activeSubscriptions.length} subscriptions for ${todayDay}`);

    for (const sub of activeSubscriptions) {
      const existingOrder = await Order.findOne({
        userId: sub.userId,
        productId: sub.productId,
        scheduledFor: todayDate,
      });

      if (!existingOrder) {
        const newOrder = await Order.create({
          userId: sub.userId,
          subscriptionId: sub._id,
          productId: sub.productId,
          quantity: sub.quantity || 1,
          scheduledFor: todayDate,
          status: "pending",
          type: "produce", 
        });
        
        console.log(`✅ Order created: User ${sub.userId} | Sub ${sub._id}`);

        // Notify Vendor in Real-time
        if (ioInstance) {
          console.log(`📡 Notifying vendor about new order for user ${sub.userId}`);
          ioInstance.emit("newOrder", {
            id: newOrder._id,
            customer: "Subscriber", // Ideally fetch user name
            plan: sub.plan || "Subscription",
            product: "Fresh Produce Box",
            date: todayDate.toLocaleDateString(),
            status: "Pending",
            type: "Subscription"
          });
        }
      } else {
        console.log(`⚠️ Skipping: Order already exists for User ${sub.userId} today.`);
      }
    }
    return { success: true, message: `Checked ${activeSubscriptions.length} subscriptions.` };
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
    const todayDate = getTodayDateKolkata();

    const result = await Subscription.updateMany(
      {
        status: "active",
        endDate: { $lt: todayDate },
      },
      {
        $set: { status: "expired" },
      }
    );

    console.log(`✅ Expired ${result.modifiedCount} subscriptions where endDate < today`);
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (error) {
    console.error("❌ Error in runSubscriptionExpiryCheck:", error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// Cron Job Registrations
// ============================================================

export const dailyOrderCreationTask = cron.schedule("0 6 * * *", runDailyOrderCreation, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

export const autoUpdateOrderStatusTask = cron.schedule("0 20 * * *", runAutoUpdateOrderStatus, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

export const subscriptionExpiryCheckTask = cron.schedule("0 0 * * *", runSubscriptionExpiryCheck, {
  scheduled: true,
  timezone: "Asia/Kolkata",
});

console.log("🚀 [SYSTEM] Subscription Automation Cron Jobs Initialized");
