import Order from "./order.model.js";
import User from "../user/user.model.js";
import Subscription from "../subscription/subscription.model.js";
import { runDailyOrderCreation } from "../../../cron/subscriptionCron.js";
import mongoose from "mongoose";

// Fetch all orders for a specific user
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
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
    if (vendorId) {
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
      }
    }

    order.status = normalizedStatus;
    if (normalizedStatus === 'delivered') {
      order.deliveredAt = new Date();
    }

    const updatedOrder = await order.save();

    // Emit real-time notification to the user
    const io = req.app.get("io");
    const users = req.app.get("users");
    
    if (io && users) {
      const userIdStr = updatedOrder.userId.toString();
      const socketId = users[userIdStr];
      if (socketId) {
        console.log(`📡 Emitting to socket ${socketId} for user ${userIdStr}`);
        io.to(socketId).emit("orderStatusUpdated", {
          orderId: updatedOrder._id,
          status: updatedOrder.status,
          type: updatedOrder.type
        });
      } else {
        console.log(`⚠️ Socket not found for user ${userIdStr}. Emitting to ALL for test mode...`);
        // Fallback for testing: Emit to everyone if exact user socket not found
        io.emit("orderStatusUpdated", {
          orderId: updatedOrder._id,
          status: updatedOrder.status,
          type: updatedOrder.type
        });
      }
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
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

// Debug helper to setup demo data
export const setupDemoData = async (req, res) => {
  try {
    const user = await User.findOne();
    const provider = await mongoose.model("Provider").findOne({ status: "approved" });

    if (!user || !provider) {
      return res.status(400).json({ 
        success: false, 
        message: "Need at least one user and one approved provider in DB to setup demo data." 
      });
    }

    const order = await Order.create({
      userId: user._id,
      providerId: null, // Leave unassigned so it shows in "Pending" for all vendors
      status: "pending",
      type: "produce",
      items: [{ name: "Organic Veggie Box", quantity: 1 }],
      scheduledFor: new Date()
    });

    res.json({ success: true, message: "Demo order created!", order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
