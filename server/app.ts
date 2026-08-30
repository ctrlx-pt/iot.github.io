import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes, type BroadcastDeviceUpdate } from "./routes";
import { registerPhase1Routes } from "./register-phase1";
import { correlationIdMiddleware, errorHandler, ok } from "./middleware/errors";
import { log } from "./logger";
import { isServerlessRuntime } from "./config/runtime";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export async function createApp(opts?: { broadcastDeviceUpdate?: BroadcastDeviceUpdate }) {
  const app = express();

  if (isServerlessRuntime()) {
    app.set("trust proxy", 1);
  }

  // CORS for separate frontend domain (set CORS_ORIGIN to your frontend URL)
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowAll = allowedOrigins.length === 0;
    const originAllowed = !origin || allowAll || allowedOrigins.includes(origin);

    if (origin && (allowAll || allowedOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Correlation-Id",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      return res.status(originAllowed ? 204 : 403).end();
    }

    next();
  });

  app.use(correlationIdMiddleware);
  app.use(cookieParser());
  // Device photos are sent as data URLs. Default Express limit is 100kb, which
  // 413s screenshots. Cap at 5mb so we stay under Netlify Functions' 6mb payload.
  const jsonBodyLimit = "5mb";
  app.use(
    express.json({
      limit: jsonBodyLimit,
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: jsonBodyLimit }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  app.get("/api/health", (_req, res) => {
    ok(res, {
      status: "ok",
      runtime: isServerlessRuntime() ? "serverless" : "node",
    });
  });

  // Phase 1 SaaS routes first (auth, companies, stores, dashboard)
  registerPhase1Routes(app);

  await registerRoutes(app, { broadcastDeviceUpdate: opts?.broadcastDeviceUpdate });

  app.use(errorHandler);

  return app;
}


