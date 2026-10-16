import { buildCoachAssignmentEmailHtml, createCoachAssignment, runCoachAssignmentCron } from "../src/core/jobs/assignmentCron.js";

async function testCoachAssignmentEngine() {
  console.log("🧪 --- STARTING COACH ASSIGNMENT CRON ENGINE TEST ---");

  // 1. Test HTML generator
  const emailHtml = buildCoachAssignmentEmailHtml({
    coachName: "Rahul Sharma",
    targetType: "client",
    targetName: "Aman Gupta",
    targetEmail: "aman@example.com",
    targetPhone: "+919876543210",
    targetGoal: "Strength & Muscle Gain",
    plan: "Personal Training Pro",
    totalSessions: 16,
    adminNotes: "Client prefers morning 7 AM IST workouts.",
    portalUrl: "http://localhost:5177/trainer/dashboard",
  });

  if (!emailHtml.includes("Rahul Sharma") || !emailHtml.includes("Aman Gupta")) {
    throw new Error("Email template rendering failed.");
  }
  console.log("✅ [TEST] Email HTML template generated successfully.");

  // 2. Test enqueueing assignment
  const assignment = await createCoachAssignment({
    assignmentType: "client",
    targetId: "test_client_001",
    targetName: "Aman Gupta",
    targetEmail: "aman@example.com",
    targetPhone: "+919876543210",
    targetGoal: "Strength & Muscle Gain",
    plan: "Personal Training Pro",
    totalSessions: 16,
    coachId: "coach_rahul_01",
    coachName: "Rahul Sharma",
    coachEmail: "rahul.trainer@example.com",
    coachPhone: "+919876543210",
    adminNotes: "Test auto-assignment for cron verification.",
  });
  console.log("✅ [TEST] Assignment created & enqueued successfully. ID:", assignment._id);

  // 3. Test running the cron job cycle
  const result = await runCoachAssignmentCron();
  console.log("✅ [TEST] Cron cycle executed with result:", result);

  console.log("🎉 --- ALL COACH ASSIGNMENT CRON TESTS PASSED ---");
  process.exit(0);
}

testCoachAssignmentEngine().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
