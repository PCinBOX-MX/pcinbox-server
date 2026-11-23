import { NextFunction, Request, Response } from "express";
import { ensureRedisConnected } from "../infra/redis/redis.client";
import { formatRetryAfterHuman } from "./registerFakeAbuse.util";

type RateBucket = {
  timestamps: number[];
};

export function resolveClientIp(req: Request): string {
  if (process.env.TRUST_PROXY !== "false") {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0]!.trim();
    }
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

function useRedisBackend(): boolean {
  const backend = (process.env.RATE_LIMIT_BACKEND || "auto").toLowerCase();
  if (backend === "memory") return false;
  if (backend === "redis") return true;
  return Boolean(process.env.REDIS_URL?.trim());
}

function failMode(): "open" | "closed" {
  return process.env.RATE_LIMIT_FAIL_MODE === "closed" ? "closed" : "open";
}

export class HttpRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly name: string,
  ) {}

  private consumeMemory(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { timestamps: [] };

    bucket.timestamps = bucket.timestamps.filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (bucket.timestamps.length >= this.maxRequests) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((this.windowMs - (now - bucket.timestamps[0]!)) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterSec: 0 };
  }

  private async consumeRedis(
    key: string,
  ): Promise<{ allowed: boolean; retryAfterSec: number } | null> {
    const redis = await ensureRedisConnected();
    if (!redis) return null;

    const windowSec = Math.max(1, Math.ceil(this.windowMs / 1000));
    const bucketId = Math.floor(Date.now() / this.windowMs);
    const redisKey = `rl:${this.name}:${key}:${bucketId}`;

    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSec);
    }

    if (count > this.maxRequests) {
      const ttl = await redis.ttl(redisKey);
      return {
        allowed: false,
        retryAfterSec: Math.max(1, ttl > 0 ? ttl : windowSec),
      };
    }

    return { allowed: true, retryAfterSec: 0 };
  }

  middleware = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (process.env.RATE_LIMIT_ENABLED === "false") {
      next();
      return;
    }

    const key = resolveClientIp(req);
    let decision = { allowed: true, retryAfterSec: 0 };

    if (useRedisBackend()) {
      try {
        const redisDecision = await this.consumeRedis(key);
        if (redisDecision) {
          decision = redisDecision;
        } else if (failMode() === "closed") {
          res.status(503).json({
            ok: false,
            message: "Servicio temporalmente no disponible. Intenta de nuevo.",
          });
          return;
        } else {
          decision = this.consumeMemory(key);
        }
      } catch {
        decision = failMode() === "closed"
          ? { allowed: false, retryAfterSec: 60 }
          : this.consumeMemory(key);
      }
    } else {
      decision = this.consumeMemory(key);
    }

    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSec));
      const when = formatRetryAfterHuman(decision.retryAfterSec);
      res.status(429).json({
        ok: false,
        message: `Demasiadas solicitudes. Espera ${when} para volver a intentarlo.`,
        retryAfterSeconds: decision.retryAfterSec,
        data: {
          retryAfterSeconds: decision.retryAfterSec,
          locked: true,
          reason: "rate_limit",
        },
      });
      return;
    }

    next();
  };
}

/** Match por prefijo con límite de segmento: `/login` no matchea `/loginGoogle`. */
export function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalizedPath = path.toLowerCase();
  const normalizedPrefix = prefix.toLowerCase();
  if (normalizedPath === normalizedPrefix) return true;
  return normalizedPath.startsWith(`${normalizedPrefix}/`);
}

export function createPathPrefixRateLimiter(
  prefixes: string[],
  limiter: HttpRateLimiter,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path.toLowerCase();
    const matches = prefixes.some((prefix) => pathMatchesPrefix(path, prefix));

    if (!matches) {
      next();
      return;
    }

    void limiter.middleware(req, res, next);
  };
}
