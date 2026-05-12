import mongoose from 'mongoose';
import '../src/features/user/user.model.js';
import '../src/features/subscription/subscription.model.js';
import OrderService from '../src/features/automation/order.service.js';

async function fixAndSync() {
  try {
    await mongoose.connect('mongodb://localhost:27017/snapnfit');
    const User = mongoose.model('User');
    const Subscription = mongoose.model('Subscription');

    const user = await User.findOne();
    if (!user) {
      console.log("❌ No user found");
      return;
    }

    const sub = await Subscription.findOne();
    if (sub) {
      sub.userId = user._id;
      sub.status = "active";
      await sub.save();
      console.log(`✅ Fixed Sub ${sub._id} with User ${user._id}`);
      
      await OrderService.syncUserOrders(user._id);
      console.log(`✅ Triggered sync for User ${user._id}`);
    } else {
      console.log("❌ No subscription found to fix");
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

fixAndSync();
