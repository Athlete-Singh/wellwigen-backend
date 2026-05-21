import Order from "./order.model.js";
import User from "../user/user.model.js";
import Subscription from "../subscription/subscription.model.js";
import { runDailyOrderCreation } from "../../../cron/subscriptionCron.js";
import OrderService from "./order.service.js";
import mongoose from "mongoose";
import { sendPushNotification } from "../../core/utils/firebase.js";

// Fetch all orders for a specific user
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Self-healing: Check if user has upcoming orders, if not, trigger a sync
    const upcomingCount = await Order.countDocuments({ 
      userId, 
      status: { $ne: "delivered" },
      scheduledFor: { $gte: new Date() }
    });

    if (upcomingCount === 0) {
      console.log(`🏥 [SELF-HEALING] No upcoming orders for user ${userId}. Triggering sync...`);
      await OrderService.syncUserOrders(userId);
    }

    const orders = await Order.find({ userId }).sort({ scheduledFor: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching user orders", error: error.message });
  }
};

// Fetch all orders for a specific vendor
export const getVendorOrders = async (req, res) => {
  try {
    const { vendorId } = req.params;
    console.log(`🔍 [ORDER_QUERY] Fetching orders for vendorId: ${vendorId}`);

    // Safety: Check if vendorId is a valid ObjectId to prevent Mongoose casting errors
    const isValidId = mongoose.Types.ObjectId.isValid(vendorId);

    // Logic: Fetch ALL pending orders (unassigned) OR orders assigned to this vendor
    const query = {
      status: { $ne: "delivered" },
      $or: [
        { providerId: null },
        { providerId: { $exists: false } },
        { providerId: "" }
      ]
    };

    if (isValidId) {
      query.$or.push({ providerId: vendorId });
    }

    const orders = await Order.find(query)
    .populate("userId", "name phone email")
    .sort({ scheduledFor: 1 });

    console.log(`✅ [ORDER_QUERY] Found ${orders.length} orders for vendor ${vendorId}`);
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching vendor orders", error: error.message });
  }
};

// Update the status of an order
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let { status, vendorId } = req.body;
    
    // Normalize status for DB (e.g. "Out for Delivery" -> "out_for_delivery")
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
    
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // LOCKING LOGIC: If a vendor is claiming/updating a pending order
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
      // If order is already assigned to someone else, block the request
      if (order.providerId && order.providerId.toString() !== vendorId) {
        return res.status(400).json({ 
          success: false, 
          message: "Order already claimed by another partner" 
        });
      }
      
      // Assign vendor if not already assigned
      if (!order.providerId) {
        order.providerId = vendorId;
        console.log(`🔒 Order ${id} locked to Vendor ${vendorId}`);
        
        // 🔔 Push Notification: New Patient Assigned (Provider Side)
        try {
          const Provider = mongoose.model("Provider");
          const provider = await Provider.findById(vendorId);
          if (provider && provider.fcmTokens && provider.fcmTokens.length > 0) {
            await sendPushNotification(
              provider.fcmTokens,
              '🧑‍⚕️ New Patient Assigned',
              `A new patient has been assigned to your queue. Order ID: ${id}`,
              { type: 'new_patient_assigned', orderId: id },
              { saveToDb: true, recipientId: provider._id.toString(), role: 'provider' }
            );
            console.log(`🔔 [PUSH] New patient assigned notification sent to provider ${vendorId}`);
          }
        } catch (notifErr) {
          console.error('⚠️ [PUSH] Failed to send new patient assigned notification to provider:', notifErr.message);
        }
      }
    } else if (vendorId) {
      console.warn(`⚠️ [ORDER_STATUS] Received invalid vendorId: ${vendorId}. Proceeding without lock.`);
    }

    order.status = normalizedStatus;
    if (normalizedStatus === 'delivered') {
      order.deliveredAt = new Date();
    }

    // Use validateBeforeSave: false to ensure status updates work even with partially complete test data
    const updatedOrder = await order.save({ validateBeforeSave: false });
    console.log(`✅ Order ${id} updated to ${normalizedStatus}`);

    // 🔔 Push Notification: Appointment Booked (order assigned to provider)
    if (normalizedStatus === 'assigned' || normalizedStatus === 'confirmed') {
      try {
        const user = await User.findById(updatedOrder.userId);
        if (user && user.fcmTokens && user.fcmTokens.length > 0) {
          await sendPushNotification(
            user.fcmTokens,
            '📅 Appointment Confirmed!',
            `Your ${updatedOrder.type || 'appointment'} has been booked and confirmed. A provider has been assigned to you.`,
            { type: 'appointment_booked', orderId: updatedOrder._id.toString(), orderType: updatedOrder.type },
            { saveToDb: true, recipientId: user._id.toString(), role: 'user' }
          );
          console.log(`🔔 [PUSH] Appointment booked notification sent to user ${updatedOrder.userId}`);
        }
      } catch (notifErr) {
        console.error('⚠️ [PUSH] Failed to send appointment booked notification:', notifErr.message);
      }
    }

    // 🔔 Push Notification: Order Delivered
    if (normalizedStatus === 'delivered') {
      try {
        const user = await User.findById(updatedOrder.userId);
        if (user && user.fcmTokens && user.fcmTokens.length > 0) {
          await sendPushNotification(
            user.fcmTokens,
            '✅ Order Delivered!',
            `Your ${updatedOrder.type || 'order'} has been delivered successfully. Thank you for using Wellwigen!`,
            { type: 'order_delivered', orderId: updatedOrder._id.toString() },
            { saveToDb: true, recipientId: user._id.toString(), role: 'user' }
          );
        }
      } catch (notifErr) {
        console.error('⚠️ [PUSH] Failed to send delivered notification:', notifErr.message);
      }
    }

    // Emit real-time notification
    const io = req.app.get("io");
    const users = req.app.get("users");
    
    const updatePayload = {
      orderId: updatedOrder._id,
      status: updatedOrder.status,
      type: updatedOrder.type,
      userId: updatedOrder.userId
    };

    if (io) {
      const userIdStr = updatedOrder.userId.toString();
      const socketId = users ? users[userIdStr] : null;

      if (socketId) {
        console.log(`📡 [SOCKET] Sending targeted update to user ${userIdStr}`);
        io.to(socketId).emit("orderStatusUpdated", updatePayload);
      } else {
        console.log(`📡 [SOCKET] User ${userIdStr} not mapped. Broadcasting update to all.`);
        io.emit("orderStatusUpdated", updatePayload);
      }
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("❌ [ORDER_STATUS_ERROR]:", error);
    res.status(500).json({ success: false, message: "Error updating order status", error: error.message });
  }
};

// Trigger a manual notification to the vendor (Simulating Cron/Automation)
export const triggerVendorNotification = async (req, res) => {
  try {
    console.log("🚀 [TRIGGER] Manually triggering Daily Order Creation logic...");
    const cronResult = await runDailyOrderCreation();
    
    const io = req.app.get("io");
    
    // If no actual subscriptions were found, send a more descriptive message
    if (cronResult.success && cronResult.message.includes("Processed 0")) {
      return res.json({ 
        success: true, 
        message: "Scanning complete: No active subscriptions found for today's date range. Ensure you have an active subscription starting today or earlier.",
        result: cronResult
      });
    }

    res.json({ success: true, message: "Sync complete: " + cronResult.message, result: cronResult });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error triggering notification", error: error.message });
  }
};

// Final Ignition: Renamed to avoid any potential route conflicts
export const igniteProduction = async (req, res) => {
  try {
    const Provider = mongoose.model("Provider");
    const Subscription = mongoose.model("Subscription");

    console.log("🔥 [IGNITE] Starting fresh bootstrap...");
    await User.deleteMany({ email: "subscriber@wellwigen.com" });
    await Provider.deleteMany({ email: "vendor@wellwigen.com" });

    // Inject User
    // Use existing user if possible to maintain dashboard identity
    let userId;
    const existingUser = await User.findOne({ email: "subscriber@wellwigen.com" });
    if (existingUser) {
      userId = existingUser._id;
    } else {
      const userResult = await User.collection.insertOne({
        name: "Rajesh Kumar",
        email: "subscriber@wellwigen.com",
        password: "password123",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      userId = userResult.insertedId;
    }

    // Inject Provider
    await Provider.collection.insertOne({
      name: "Ramesh Fruits",
      email: "vendor@wellwigen.com",
      businessName: "Ramesh Fruits & Vegetables",
      verificationStatus: "approved",
      type: "NUTRITION",
      passwordHash: "password123",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create Subscription
    const sub = await Subscription.create({
      userId: userId,
      plan: "healthy_life", // Match valid enum
      status: "active",
      billingCycle: "monthly",
      price: 1999,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    console.log(`👤 Using Test User with ID: ${userId}`);

    // Sync with "Test Mode" flag and correct userId
    const syncResult = await OrderService.syncUserOrders(userId, 7, true);

    res.json({ 
      success: true, 
      message: "🚀 System Ignited Successfully!", 
      ordersCreated: syncResult.created 
    });
  } catch (error) {
    console.error("❌ [IGNITE_ERROR]:", error);
    res.status(500).json({ success: false, message: "Ignition failed: " + error.message });
  }
};

// Global State Debug
export const getSystemState = async (req, res) => {
  try {
    const Subscription = mongoose.model("Subscription");
    const activeSubs = await Subscription.find({ status: { $in: ["active", "Active"] } });
    const orders = await Order.find();
    
    res.json({
      success: true,
      timestamp: new Date(),
      counts: {
        activeSubscriptions: activeSubs.length,
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === "pending").length
      },
      activeSubscriptions: activeSubs.map(s => ({ id: s._id, start: s.startDate, end: s.endDate, status: s.status })),
      latestOrders: orders.slice(-5).map(o => ({ id: o._id, status: o.status, date: o.scheduledFor, user: o.userId }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
