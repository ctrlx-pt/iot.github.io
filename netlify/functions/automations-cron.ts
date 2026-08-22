import { schedule } from "@netlify/functions";
import { runAutomationSchedulerTick } from "../../server/services/automations/runner";

/** Netlify scheduled function — replaces setInterval scheduler on serverless. */
export const handler = schedule("* * * * *", async () => {
  const result = await runAutomationSchedulerTick();
  console.log("[automations-cron]", JSON.stringify(result));
  return result;
});
