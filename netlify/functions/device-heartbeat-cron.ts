import { schedule } from "@netlify/functions";
import { runDeviceHeartbeatSchedulerTick } from "../../server/services/devices/heartbeat-scheduler";

/** Netlify scheduled function — polls all devices every 5 minutes. */
export const handler = schedule("*/5 * * * *", async () => {
  const result = await runDeviceHeartbeatSchedulerTick();
  console.log("[device-heartbeat-cron]", JSON.stringify(result));
  return result;
});
