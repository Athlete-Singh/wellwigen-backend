import Order from "./order.model.js";
import Subscription from "../subscription/subscription.model.js";

/**
 * Service to manage order automation and synchronization
 */
class OrderService {
  /**
   * Smart order generation per plan frequency
   * Silver: Tue(2), Fri(5)
   * Gold: Mon(1), Wed(3), Fri(5)
   * Platinum: Daily
   */
  getPlanDeliveryDays(plan) {
    const planMap = {
      'fit_start': [2, 5],
      'silver': [2, 5],
      'healthy_life': [1, 3, 5],
      'gold': [1, 3, 5],
      'total_wellness': [0, 1, 2, 3, 4, 5, 6],
      'platinum': [0, 1, 2, 3, 4, 5, 6],
      'basic': [2, 5],
      'premium': [0, 1, 2, 3, 4, 5, 6],
    };
    const normalizedPlan = plan?.toLowerCase().replace(/\s+/g, '_');
    return planMap[normalizedPlan] || planMap[plan?.toLowerCase()] || [2, 5];
  }

  /**
   * Get upcoming delivery dates for a plan
   */
  getUpcomingDates(plan, daysAhead = 14) {
    const deliveryDays = this.getPlanDeliveryDays(plan);
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i <= daysAhead; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (deliveryDays.includes(d.getDay())) {
        const slot = new Date(d);
        slot.setHours(8, 0, 0, 0); // Standard 8 AM delivery slot
        dates.push(slot);
      }
      if (dates.length >= 7) break; 
    }
    return dates;
  }

  /**
   * Ensure orders exist for a specific user based on their active subscription
   */
  async syncUserOrders(userId, daysAhead = 14, forceToday = false) {
    try {
      if (!userId) {
        console.log(`⚠️ [ORDER_SERVICE] Cannot sync orders: No userId provided.`);
        return { created: 0, message: "No userId provided" };
      }
      console.log(`🔄 [ORDER_SERVICE] Syncing orders for User: ${userId}`);
      
      const activeSub = await Subscription.findOne({
        userId,
        status: { $in: ["active", "Active", "pending", "Pending"] }
      });

      if (!activeSub) {
        console.log(`⚠️ [ORDER_SERVICE] No active subscription found for User: ${userId}`);
        return { created: 0, message: "No active subscription" };
      }

      const deliveryDays = this.getPlanDeliveryDays(activeSub.plan);
      let created = 0;

      for (let i = 0; i < daysAhead; i++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + i);
        const dayOfWeek = targetDate.getDay();

        // If forceToday is true, we ALWAYS create an order for today (i=0)
        if (forceToday && i === 0) {
          // Proceed to create
        } else if (!deliveryDays.includes(dayOfWeek)) {
          continue;
        }

        const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

        const existing = await Order.findOne({
          userId,
          subscriptionId: activeSub._id,
          scheduledFor: { $gte: dayStart, $lte: dayEnd }
        });

        if (!existing) {
          await Order.create({
            userId,
            subscriptionId: activeSub._id,
            scheduledFor: targetDate,
            status: "pending",
            type: "produce",
            items: [{ 
              name: activeSub.plan === 'fit_start' || activeSub.plan === 'Silver' ? 'Fresh Seasonal Box' :
                    activeSub.plan === 'healthy_life' || activeSub.plan === 'Gold' ? 'Extended Variety Box' :
                    'Premium Organic Box', 
              quantity: 1 
            }]
          });
          created++;
        }
      }

      console.log(`✅ [ORDER_SERVICE] Sync complete for User: ${userId}. Created ${created} orders.`);
      return { created, message: `Created ${created} upcoming orders` };
    } catch (err) {
      console.error(`❌ [ORDER_SERVICE] Error syncing user orders:`, err.message);
      throw err;
    }
  }

  /**
   * Sync orders for all active subscribers (Global Sync)
   */
  async syncAllActiveOrders() {
    try {
      const activeSubs = await Subscription.find({
        status: { $in: ["active", "Active", "pending", "Pending"] }
      });

      console.log(`🔄 [ORDER_SERVICE] Global sync started for ${activeSubs.length} subscriptions`);
      
      let totalCreated = 0;
      for (const sub of activeSubs) {
        try {
          const res = await this.syncUserOrders(sub.userId);
          totalCreated += res.created;
        } catch (subErr) {
          console.error(`⚠️ [ORDER_SERVICE] Skipping sync for user ${sub.userId}:`, subErr.message);
        }
      }

      return { success: true, totalCreated, processed: activeSubs.length };
    } catch (err) {
      console.error(`❌ [ORDER_SERVICE] Global sync failed:`, err.message);
      throw err;
    }
  }
}

export default new OrderService();
