import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import serverless from "serverless-http";
import type { Application } from "express";
import { createApp } from "../../server/app";

let appPromise: Promise<Application> | null = null;
let expressHandler: ReturnType<typeof serverless> | null = null;

async function getHandler() {
  if (!appPromise) appPromise = createApp();
  if (!expressHandler) {
    const app = await appPromise;
    expressHandler = serverless(app, {
      binary: [
        "image/*",
        "application/octet-stream",
        "application/pdf",
        "font/*",
      ],
    });
  }
  return expressHandler;
}

/** Map Netlify function path → Express route path. */
function rewritePath(event: HandlerEvent): HandlerEvent {
  const raw = event.path || "";
  const prefix = "/.netlify/functions/api";

  if (raw.startsWith(prefix)) {
    const rest = raw.slice(prefix.length) || "/";
    const normalizedRest = rest.startsWith("/") ? rest : `/${rest}`;

    if (normalizedRest === "/ha-proxy-sw.js") {
      return { ...event, path: "/ha-proxy-sw.js" };
    }
    if (normalizedRest.startsWith("/ha-auth/")) {
      return {
        ...event,
        path: normalizedRest.replace(/^\/ha-auth\//, "/auth/"),
      };
    }
    return { ...event, path: `/api${normalizedRest}` };
  }

  // Direct hits (local netlify dev / some proxies)
  if (raw === "/ha-proxy-sw.js") return event;
  if (raw.startsWith("/auth/") && !raw.startsWith("/api/")) {
    return event;
  }
  if (raw.startsWith("/api/") || raw === "/api") return event;

  return { ...event, path: `/api${raw.startsWith("/") ? raw : `/${raw}`}` };
}

export const handler: Handler = async (event, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const fn = await getHandler();
  return fn(rewritePath(event), context);
};
