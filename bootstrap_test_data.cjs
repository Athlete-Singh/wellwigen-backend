const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const UserSchema = new mongoose.Schema({ name: String, email: String }, { strict: false });
const ProviderSchema = new mongoose.Schema({ name: String, email: String, verificationStatus: String }, { strict: false });
const SubscriptionSchema = new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, plan: String, status: String, startDate: Date, endDate: Date }, { strict: false });

async function bootstrap() {
  try {
    await mongoose.connect(process.env.MONGO_URL, { dbName: "wellwigen" });
    console.log("Connected to MongoDB");

    const User = mongoose.model('User', UserSchema);
    const Provider = mongoose.model('Provider', ProviderSchema);
    const Subscription = mongoose.model('Subscription', SubscriptionSchema);

    // 1. Create User
    let user = await User.findOne({ email: 'subscriber@wellwigen.com' });
    if (!user) {
      user = await User.create({ name: 'Rajesh Kumar', email: 'subscriber@wellwigen.com' });
      console.log("✅ User created");
    }

    // 2. Create Approved Provider
    let provider = await Provider.findOne({ email: 'vendor@wellwigen.com' });
    if (!provider) {
      provider = await Provider.create({ 
        name: 'Ramesh Fruits', 
        email: 'vendor@wellwigen.com', 
        verificationStatus: 'approved',
        businessName: 'Ramesh Fruits & Vegetables'
      });
      console.log("✅ Provider created");
    }

    // 3. Create Active Subscription
    let sub = await Subscription.findOne({ userId: user._id, status: 'active' });
    if (!sub) {
      sub = await Subscription.create({
        userId: user._id,
        plan: 'gold',
        status: 'active',
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started yesterday
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      console.log("✅ Subscription created");
    }

    console.log("\n🚀 BOOTSTRAP COMPLETE!");
    console.log("Now refresh your Vendor Dashboard. The orders will auto-generate.");
    process.exit(0);
  } catch (err) {
    console.error("Bootstrap Error:", err);
    process.exit(1);
  }
}

bootstrap();
