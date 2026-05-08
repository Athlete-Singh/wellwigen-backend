import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
import Order from './src/features/automation/order.model.js';
import Subscription from './src/features/subscription/subscription.model.js';
import User from './src/features/user/user.model.js';
import Provider from './src/features/provider/provider.model.js';

dotenv.config();

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("✅ Connected to MongoDB");

        const users = await User.find();
        console.log(`\n👥 Users: ${users.length}`);
        users.forEach(u => console.log(`- ${u.name} (${u._id}) role: ${u.role}`));

        const providers = await Provider.find();
        console.log(`\n🏪 Providers/Vendors: ${providers.length}`);
        providers.forEach(p => console.log(`- ${p.name} (${p._id}) status: ${p.status} type: ${p.type}`));

        const subs = await Subscription.find().populate('userId');
        console.log(`\n💳 Subscriptions: ${subs.length}`);
        subs.forEach(s => console.log(`- User: ${s.userId?.name} Plan: ${s.plan} Status: ${s.status}`));

        const orders = await Order.find().populate('userId').populate('providerId');
        console.log(`\n📦 Orders: ${orders.length}`);
        orders.forEach(o => console.log(`- User: ${o.userId?.name} Vendor: ${o.providerId?.name || 'Unassigned'} Status: ${o.status} Date: ${o.scheduledFor}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

check();
