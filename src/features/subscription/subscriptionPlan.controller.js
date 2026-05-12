import SubscriptionPlan from "./subscriptionPlan.model.js";

export const getAllPlans = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
};

export const getActivePlans = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ status: "active" });
    res.status(200).json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
};

export const createPlan = async (req, res, next) => {
  try {
    console.log("📥 [API] Creating Subscription Plan:", req.body);
    const plan = new SubscriptionPlan(req.body);

    await plan.save();
    res.status(201).json({ success: true, message: "Plan created successfully", data: plan });
  } catch (err) {
    next(err);
  }
};

export const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findByIdAndUpdate(id, req.body, { new: true });
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    res.status(200).json({ success: true, message: "Plan updated successfully", data: plan });
  } catch (err) {
    next(err);
  }
};

export const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findByIdAndDelete(id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export const togglePlanStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findById(id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

    plan.status = plan.status === "active" ? "inactive" : "active";
    await plan.save();

    res.status(200).json({ success: true, message: `Plan ${plan.status} successfully`, data: plan });
  } catch (err) {
    next(err);
  }
};
