import axios from 'axios';

const API_URL = 'http://localhost:8000/api/subscription-plans';

const plans = [
  {
    name: "Fit Start",
    description: "The perfect entry point for your wellness journey. Includes basic nutrition and primary care.",
    prices: { monthly: 499, quarterly: 1422, annual: 5089 },
    features: ["2 fruit deliveries/week", "1 GP consultation/month", "1 basic lab panel/month", "Standard support"],
    status: "active", deliveryDays: 8, duration: "1 Month", tag: ""
  },
  {
    name: "Healthy Life",
    description: "Our most popular plan for individuals looking to optimize their health with regular trainer sessions.",
    prices: { monthly: 999, quarterly: 2847, annual: 10189 },
    features: ["3 fruit deliveries/week", "3 consultations/month", "2 lab panels/month", "8 trainer sessions/month", "Pharmacy auto-refill"],
    status: "active", deliveryDays: 12, duration: "1 Month", tag: "Most Popular"
  },
  {
    name: "Total Wellness",
    description: "The ultimate health shield for you and your family. Comprehensive care without limits.",
    prices: { monthly: 1999, quarterly: 5697, annual: 20389 },
    features: ["Daily fruit delivery", "Unlimited consultations", "Comprehensive quarterly labs", "Unlimited trainer sessions", "Up to 4 family members"],
    status: "active", deliveryDays: 30, duration: "1 Month", tag: "Best Value"
  }
];

const seedPlans = async () => {
  try {
    console.log("Seeding plans via API...");
    for (const plan of plans) {
      await axios.post(API_URL, plan);
      console.log(`✅ Seeded: ${plan.name}`);
    }
    console.log("Successfully seeded original plans!");
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err.response ? err.response.data : err.message);
    process.exit(1);
  }
};

seedPlans();

