import { Express, NextFunction, Request, Response } from "express";
import {
  createPathPrefixRateLimiter,
  HttpRateLimiter,
  resolveClientIp,
} from "../utils/http-rate-limiter.util";

const PROBE_PATTERNS = [
  "/.env",
  "/.git",
  "/wp-admin",
  "/wp-login",
  "/phpmyadmin",
  "/xmlrpc.php",
  "/vendor/phpunit",
  "/actuator",
  "/.aws",
  "/cgi-bin",
  "/shell",
];

export const globalRateLimiter = new HttpRateLimiter(
  Number(process.env.RATE_LIMIT_GLOBAL_MAX || 250),
  Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 60_000),
  "global",
);

export const authRateLimiter = new HttpRateLimiter(
  Number(process.env.RATE_LIMIT_AUTH_MAX || 20),
  Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 900_000),
  "auth",
);

export const strictRateLimiter = new HttpRateLimiter(
  Number(process.env.RATE_LIMIT_STRICT_MAX || 60),
  Number(process.env.RATE_LIMIT_STRICT_WINDOW_MS || 60_000),
  "strict",
);

export function applySecurityBaseline(app: Express): void {
  app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
  app.disable("x-powered-by");
}

export function blockMaliciousProbePaths(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = req.path.toLowerCase();

  if (path.includes("..")) {
    console.warn(
      `[security] Path traversal bloqueado: ${req.method} ${req.path} IP=${resolveClientIp(req)}`,
    );
    res.status(404).json({ ok: false, message: "Not found" });
    return;
  }

  if (PROBE_PATTERNS.some((pattern) => path.includes(pattern))) {
    console.warn(
      `[security] Probe bloqueado: ${req.method} ${req.path} IP=${resolveClientIp(req)}`,
    );
    res.status(404).json({ ok: false, message: "Not found" });
    return;
  }

  next();
}

export const authPathRateLimiter = createPathPrefixRateLimiter(
  [
    "/api/v1/user/login",
    "/api/v1/user/logingoogle",
    "/api/v1/user/register",
    "/api/v1/resetpassword",
  ],
  authRateLimiter,
);

export const checkoutPathRateLimiter = createPathPrefixRateLimiter(
  ["/api/v1/sales/registersales", "/api/v1/cart"],
  strictRateLimiter,
);
