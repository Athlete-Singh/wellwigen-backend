import { Queue, Worker, QueueEvents } from "bullmq";
import cron from "node-cron";
import redisConnection from "../config/redis.js";
import Schedule from "../../features/automation/schedule.model.js";
import Order from "../../features/automation/order.model.js";
import Provider from "../../features/provider/provider.model.js";

// ================= BULLMQ QUEUES =================
let orderQueue = null;
let orderWorker = null;
let timeoutWorker = null;

// Helper to convert Degrees to Radians for Haversine
const deg2rad = (deg) => deg * (Math.PI / 180);

// Simple Haversine Distance Calculation (since we don't have PostGIS enabled in MongoDB by default in this setup)
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Generate Daily Orders (Runs daily at 11:00 PM)
export const startAutomationEngine = () => {
  
  // LAZY INITIALIZATION TO PREVENT REDIS ERRORS IF NOT USED
  if (!orderQueue) {
    orderQueue = new Queue("order-assignment", { connection: redisConnection });
  }

  if (!orderWorker) {
    orderWorker = new Worker(
      "order-assignment",
      async (job) => {
        const { orderId, userLat, userLng, type, retryCount } = job.data;

        const order = await Order.findById(orderId);
        if (!order || order.status !== "pending") return;

        const providers = await Provider.find({
          type,
          isActive: true,
          isVerified: true,
          currentLoad: { $lt: 50 }, 
        });

        if (providers.length === 0) {
          console.log(`[Engine] No available providers found for order ${orderId}`);
          return;
        }

        const scoredProviders = providers.map((provider) => {
          let distanceKm = 0;
          if (provider.location?.coordinates?.length === 2 && userLat && userLng) {
            distanceKm = getDistanceFromLatLonInKm(
              userLat,
              userLng,
              provider.location.coordinates[1],
              provider.location.coordinates[0]
            );
          }
          
          const proximityScore = Math.max(0, 100 - distanceKm * 10);
          const ratingScore = (provider.rating / 5) * 100;
          const acceptanceScore = provider.acceptanceRate;
          const capacityScore = Math.max(0, 100 - (provider.currentLoad / provider.capacityLimit) * 100);

          const totalScore = proximityScore * 0.4 + ratingScore * 0.3 + acceptanceScore * 0.2 + capacityScore * 0.1;

          return { provider, totalScore, distanceKm };
        });

        const eligibleProviders = scoredProviders
          .filter((p) => p.distanceKm <= p.provider.serviceRadiusKm)
          .sort((a, b) => b.totalScore - a.totalScore);

        if (eligibleProviders.length === 0) {
          console.log(`[Engine] No providers within radius for order ${orderId}`);
          return;
        }

        const topProvider = eligibleProviders[0].provider;
        order.providerId = topProvider._id;
        order.status = "assigned";
        await order.save();

        console.log(`[Engine] Order ${orderId} assigned to Provider ${topProvider.businessName}`);

        await orderQueue.add(
          "check-acceptance-timeout",
          { orderId, providerId: topProvider._id, userLat, userLng, type, retryCount: retryCount + 1 },
          { delay: 30 * 60 * 1000 } 
        );
      },
      { connection: redisConnection }
    );
    orderWorker.on("error", () => {});
  }

  if (!timeoutWorker) {
    timeoutWorker = new Worker(
      "order-assignment",
      async (job) => {
        if (job.name !== "check-acceptance-timeout") return;
        const { orderId, providerId, userLat, userLng, type, retryCount } = job.data;

        const order = await Order.findById(orderId);
        if (order && order.status === "assigned" && order.providerId.toString() === providerId) {
          if (retryCount >= 3) {
            order.status = "failed";
            order.failureReason = "No providers accepted the order";
            await order.save();
            console.log(`[Engine] Order ${orderId} failed after 3 retries.`);
          } else {
            order.status = "pending";
            order.providerId = null;
            await order.save();
            console.log(`[Engine] Provider timed out on Order ${orderId}. Retrying...`);
            await orderQueue.add("assign-provider", { orderId, userLat, userLng, type, retryCount });
          }
        }
      },
      { connection: redisConnection }
    );
    timeoutWorker.on("error", () => {});
  }

  cron.schedule("0 23 * * *", async () => {
    console.log("[Engine] Running Generate Daily Orders Cron...");
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dueSchedules = await Schedule.find({
      isActive: true,
      nextRunAt: { $lte: tomorrow },
    });

    for (const schedule of dueSchedules) {
      const newOrder = new Order({
        userId: schedule.userId,
        subscriptionId: schedule.subscriptionId,
        scheduleId: schedule._id,
        type: schedule.type,
        status: "pending",
        scheduledFor: schedule.nextRunAt,
        items: schedule.itemDetails?.items || [], 
      });

      await newOrder.save();

      await orderQueue.add("assign-provider", {
        orderId: newOrder._id,
        type: schedule.type,
        userLat: 26.8467, 
        userLng: 80.9462,
        retryCount: 0,
      });

      const nextRun = new Date(schedule.nextRunAt);
      if (schedule.frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
      if (schedule.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
      if (schedule.frequency === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
      
      schedule.nextRunAt = nextRun;
      schedule.lastRunAt = new Date();
      schedule.totalRuns += 1;
      await schedule.save();

      console.log(`[Engine] Generated Order ${newOrder._id} for Schedule ${schedule._id}`);
    }
  });

  console.log("⚙️ Automation Engine & BullMQ Workers Started");
};
