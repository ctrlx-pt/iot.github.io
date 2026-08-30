import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "ERROR", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data, errors: [] });
}

export function fail(
  res: Response,
  status: number,
  message: string,
  code = "ERROR",
  errors: unknown[] = [],
) {
  return res.status(status).json({
    success: false,
    data: null,
    errors: errors.length ? errors : [{ code, message }],
  });
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-correlation-id");
  const id = incoming && incoming.trim() ? incoming.trim() : randomUUID();
  (req as any).correlationId = id;
  res.setHeader("x-correlation-id", id);
  next();
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const correlationId = (req as any).correlationId;
  const tooLarge =
    err?.type === "entity.too.large" || err?.status === 413 || err?.statusCode === 413;
  if (tooLarge) {
    return res.status(413).json({
      success: false,
      data: null,
      errors: [
        {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request is too large. Use a smaller photo.",
        },
      ],
      correlationId,
    });
  }

  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  if (status >= 500) {
    console.error(`[${correlationId}]`, err);
  }

  return res.status(status).json({
    success: false,
    data: null,
    errors: [
      {
        code: err.code || "INTERNAL_ERROR",
        message: status >= 500 && isProd ? "Internal Server Error" : err.message || "Error",
      },
    ],
    correlationId,
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
