"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpRateLimiter = void 0;
exports.resolveClientIp = resolveClientIp;
exports.createPathPrefixRateLimiter = createPathPrefixRateLimiter;
const redis_client_1 = require("../infra/redis/redis.client");
function resolveClientIp(req) {
    if (process.env.TRUST_PROXY !== "false") {
        const forwarded = req.headers["x-forwarded-for"];
        if (typeof forwarded === "string" && forwarded.trim()) {
            return forwarded.split(",")[0].trim();
        }
    }
    return req.ip || req.socket.remoteAddress || "unknown";
}
function useRedisBackend() {
    const backend = (process.env.RATE_LIMIT_BACKEND || "auto").toLowerCase();
    if (backend === "memory")
        return false;
    if (backend === "redis")
        return true;
    return Boolean(process.env.REDIS_URL?.trim());
}
function failMode() {
    return process.env.RATE_LIMIT_FAIL_MODE === "closed" ? "closed" : "open";
}
class HttpRateLimiter {
    maxRequests;
    windowMs;
    name;
    buckets = new Map();
    constructor(maxRequests, windowMs, name) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.name = name;
    }
    consumeMemory(key) {
        const now = Date.now();
        const bucket = this.buckets.get(key) ?? { timestamps: [] };
        bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
        if (bucket.timestamps.length >= this.maxRequests) {
            const retryAfterSec = Math.max(1, Math.ceil((this.windowMs - (now - bucket.timestamps[0])) / 1000));
            return { allowed: false, retryAfterSec };
        }
        bucket.timestamps.push(now);
        this.buckets.set(key, bucket);
        return { allowed: true, retryAfterSec: 0 };
    }
    async consumeRedis(key) {
        const redis = await (0, redis_client_1.ensureRedisConnected)();
        if (!redis)
            return null;
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
    middleware = async (req, res, next) => {
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
                }
                else if (failMode() === "closed") {
                    res.status(503).json({
                        ok: false,
                        message: "Servicio temporalmente no disponible. Intenta de nuevo.",
                    });
                    return;
                }
                else {
                    decision = this.consumeMemory(key);
                }
            }
            catch {
                decision = failMode() === "closed"
                    ? { allowed: false, retryAfterSec: 60 }
                    : this.consumeMemory(key);
            }
        }
        else {
            decision = this.consumeMemory(key);
        }
        if (!decision.allowed) {
            res.setHeader("Retry-After", String(decision.retryAfterSec));
            res.status(429).json({
                ok: false,
                message: "Demasiadas solicitudes. Intenta de nuevo en unos momentos.",
                retryAfterSeconds: decision.retryAfterSec,
            });
            return;
        }
        next();
    };
}
exports.HttpRateLimiter = HttpRateLimiter;
function createPathPrefixRateLimiter(prefixes, limiter) {
    return (req, res, next) => {
        const path = req.path.toLowerCase();
        const matches = prefixes.some((prefix) => path.startsWith(prefix.toLowerCase()));
        if (!matches) {
            next();
            return;
        }
        void limiter.middleware(req, res, next);
    };
}
//# sourceMappingURL=http-rate-limiter.util.js.map