import Order from "./order.model.js";
import { runDailyOrderCreation } from "../../../cron/subscriptionCron.js";

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
    // Note: Assuming the vendor is linked via productId or a direct vendorId on the order. 
    // In our order model, we have providerId. We will use providerId as vendorId.
    const orders = await Order.find({ providerId: vendorId }).sort({ scheduledFor: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching vendor orders", error: error.message });
  }
};

// Update the status of an order
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updateData = { status };
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

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
    
    // Fallback: If no actual subscriptions were found, send a mock order for demo purposes
    if (cronResult.success && cronResult.message.includes("Checked 0")) {
      const mockOrder = {
        id: "mock_" + Date.now(),
        customer: "Rajesh Kumar",
        plan: "Total Wellness",
        product: "Seasonal Fruit Box",
        date: new Date().toLocaleDateString(),
        status: "Pending",
        type: "Subscription"
      };

      if (io) {
        io.emit("newOrder", mockOrder);
      }
      return res.json({ success: true, message: "No active subscriptions found, sent mock notification instead", order: mockOrder });
    }

    res.json({ success: true, message: "Automation logic executed successfully", result: cronResult });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error triggering notification", error: error.message });
  }
};
