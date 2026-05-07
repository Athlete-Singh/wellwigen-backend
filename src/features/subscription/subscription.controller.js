import Subscription from "./subscription.model.js";
import razorpayInstance from "../../core/config/razorpay.js";
import crypto from "crypto";

const planPrices = {
  fit_start: { monthly: 499, quarterly: 1422, annual: 5089 },
  healthy_life: { monthly: 999, quarterly: 2847, annual: 10189 },
  total_wellness: { monthly: 1999, quarterly: 5697, annual: 20389 },
};

export const createSubscription = async (req, res, next) => {
  try {
    const { userId, plan, billingCycle, members } = req.body;
    
    // Validate
    if (!planPrices[plan] || !planPrices[plan][billingCycle]) {
      return res.status(400).json({ success: false, message: "Invalid plan or billing cycle" });
    }

    if (plan === "total_wellness" && members?.length > 5) {
      return res.status(400).json({ success: false, message: "Family plan allows maximum 5 members" });
    }

    const price = planPrices[plan][billingCycle];

    // Check if user already has an active subscription
    const existingSub = await Subscription.findOne({ userId, status: "active" });
    if (existingSub) {
      return res.status(400).json({ success: false, message: "You already have an active subscription" });
    }

    // Note: In a production app, you would pre-create plans on Razorpay dashboard
    // and fetch the exact plan_id using an environment map. For development, we pass a dummy.
    const planIdKey = `RAZORPAY_PLAN_${plan.toUpperCase()}_${billingCycle.toUpperCase()}`;
    const razorpayPlanId = process.env[planIdKey] || "plan_dummy_id_replace_later";

    const razorpaySub = await razorpayInstance.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      total_count: billingCycle === "monthly" ? 12 : billingCycle === "quarterly" ? 4 : 1,
    });

    const subscription = new Subscription({
      userId,
      plan,
      price,
      billingCycle,
      status: "pending",
      razorpaySubscriptionId: razorpaySub.id,
      members: members || [],
    });
    
    await subscription.save();

    res.status(201).json({
      success: true,
      subscriptionId: subscription._id,
      razorpaySubscriptionId: razorpaySub.id,
      key: process.env.RAZORPAY_KEY_ID || "rzp_test_dummykey123"
    });
  } catch (err) {
    next(err);
  }
};

export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, subscriptionId } = req.body;

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "dummysecret456")
      .update(razorpay_payment_id + "|" + razorpay_subscription_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) return res.status(404).json({ success: false, message: "Subscription not found" });

    subscription.status = "active";
    subscription.startDate = new Date();
    // FOR TESTING: Set endDate to 30 days from now
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    
    subscription.endDate = endDate;
    subscription.nextRenewalDate = endDate;

    await subscription.save();

    res.status(200).json({ success: true, message: "Payment verified and subscription activated!", data: subscription });
  } catch (err) {
    next(err);
  }
};

export const getMySubscription = async (req, res, next) => {
  try {
    const { userId } = req.params; // In a full auth setup, we extract this from req.user
    const subscription = await Subscription.findOne({ userId, status: { $in: ["active", "paused"] } });
    res.status(200).json({ success: true, data: subscription });
  } catch (err) {
    next(err);
  }
};

export const cancelSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) return res.status(404).json({ success: false, message: "Not found" });

    await razorpayInstance.subscriptions.cancel(subscription.razorpaySubscriptionId);

    subscription.status = "cancelled";
    subscription.cancelledAt = new Date();
    await subscription.save();

    res.status(200).json({ success: true, message: "Subscription cancelled successfully", data: subscription });
  } catch (err) {
    next(err);
  }
};

export const pauseSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) return res.status(404).json({ success: false, message: "Not found" });

    if (subscription.billingCycle !== "annual") {
      return res.status(400).json({ success: false, message: "Only annual plans can be paused" });
    }

    if (subscription.pauseCount >= 2) {
      return res.status(400).json({ success: false, message: "Pause limit reached for this year" });
    }

    // Note: Razorpay pause requires `{ pause_at: "now" }` in their API payload
    await razorpayInstance.subscriptions.pause(subscription.razorpaySubscriptionId, { pause_at: "now" });

    subscription.status = "paused";
    subscription.pausedAt = new Date();
    subscription.pauseCount += 1;
    await subscription.save();

    res.status(200).json({ success: true, message: "Subscription paused successfully", data: subscription });
  } catch (err) {
    next(err);
  }
};
export const getSubscription = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const subscriptions = await Subscription.find({ userId });
    res.status(200).json({ success: true, data: subscriptions });
  } catch (err) {
    next(err);
  }
};

// ✅ Dev/testing: directly activate a subscription without Razorpay
export const activateSubscriptionDirect = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return res.status(404).json({ success: false, message: "Subscription not found" });

    sub.status = "active";
    sub.startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    sub.endDate = endDate;
    sub.nextRenewalDate = endDate;
    await sub.save();

    res.json({ success: true, message: "Subscription activated directly!", data: sub });
  } catch (err) {
    next(err);
  }
};

// ✅ Dev/testing: create + immediately activate a subscription for any userId
export const createAndActivateSubscription = async (req, res, next) => {
  try {
    const { userId, plan = "fit_start", billingCycle = "monthly" } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "userId required" });

    // Remove any existing pending subscriptions for this user
    await Subscription.deleteMany({ userId, status: "pending" });

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const sub = await Subscription.create({
      userId,
      plan,
      billingCycle,
      price: 499,
      status: "active",
      startDate: new Date(),
      endDate,
      nextRenewalDate: endDate
    });

    res.json({ success: true, message: "Subscription created and activated!", data: sub });
  } catch (err) {
    next(err);
  }
};
