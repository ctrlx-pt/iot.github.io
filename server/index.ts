import "dotenv/config";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { deviceUpdateMessageSchema, type DeviceUpdateMessage, type Light, type Tv } from "@shared/schema";
import { createApp } from "./app";
import { log } from "./logger";
import { registerRealtimeClient } from "./services/realtime";
import { startAutomationScheduler } from "./services/automations/runner";
import { startDeviceHeartbeatScheduler } from "./services/devices/heartbeat-scheduler";

(async () => {
  const httpServer = createServer();

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");
    const unregister = registerRealtimeClient(ws as any);

    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        if (data?.type === "subscribe" && Array.isArray(data.companyIds)) {
          (ws as any).companyIds = data.companyIds;
        }
      } catch (error) {
        console.error("Invalid WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      unregister();
      console.log("WebSocket client disconnected");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  function broadcastDeviceUpdate(
    type: "light_update" | "tv_update",
    deviceId: string,
    data: Light | Tv,
  ) {
    try {
      const message: DeviceUpdateMessage = {
        type,
        deviceId,
        data,
      };

      const validatedMessage = deviceUpdateMessageSchema.parse(message);
      const messageStr = JSON.stringify(validatedMessage);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(messageStr);
          } catch (error) {
            console.error("Failed to send WebSocket message to client:", error);
          }
        }
      });
    } catch (error) {
      console.error("Failed to create valid WebSocket message:", error);
    }
  }

  const app = await createApp({ broadcastDeviceUpdate });
  httpServer.on("request", app);

  const serveFrontend = process.env.SERVE_STATIC !== "false";
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, httpServer);
  } else if (serveFrontend) {
    const { serveStatic } = await import("./vite.js");
    serveStatic(app);
  }

  startAutomationScheduler();
  startDeviceHeartbeatScheduler();

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
