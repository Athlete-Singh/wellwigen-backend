import dotenv from "dotenv";
dotenv.config();
import { sendProviderApprovalEmail } from "../src/core/utils/email.js";

async function main() {
  console.log("Starting test email...");
  try {
    const res = await sendProviderApprovalEmail(
      "kumariaimran2018@gmail.com",
      "test_pass_123",
      "DOCTOR",
      "Test Doctor Clinic"
    );
    console.log("Result:", res);
  } catch (err) {
    console.error("Error during test email:", err);
  }
}
main();
