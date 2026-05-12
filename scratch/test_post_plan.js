import axios from 'axios';


const testData = {
  name: "Test Plan " + Date.now(),
  description: "Test Description",
  prices: { monthly: 100, quarterly: 250, annual: 900 },
  features: ["Feature 1", "Feature 2"],
  status: "active",
  deliveryDays: 4,
  quantity: 1,
  duration: "1 Month",
  tag: "New",
  razorpayPlanIds: { monthly: "plan_1", quarterly: "plan_2", annual: "plan_3" }
};

axios.post('http://localhost:8000/api/subscription-plans', testData)
  .then(res => {
    console.log("✅ Success:", res.data);
  })
  .catch(err => {
    console.error("❌ Error:", err.response ? err.response.data : err.message);
  });
