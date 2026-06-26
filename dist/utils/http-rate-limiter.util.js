"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpRateLimiter = void 0;
exports.resolveClientIp = resolveClientIp;
exports.createPathPrefixRateLimiter = createPathPrefixRateLimiter;
function resolveClientIp(req) {
    if (process.env.TRUST_PROXY !== "false") {
        const forwarded = req.headers["x-forwarded-for"];
        if (typeof forwarded === "string" && forwarded.trim()) {
            return forwarded.split(",")[0].trim();
        }
    }
    return req.ip || req.socket.remoteAddress || "unknown";
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
    middleware = (req, res, next) => {
        if (process.env.RATE_LIMIT_ENABLED === "false") {
            next();
            return;
        }
        const key = `${this.name}:${resolveClientIp(req)}`;
        const now = Date.now();
        const bucket = this.buckets.get(key) ?? { timestamps: [] };
        bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
        if (bucket.timestamps.length >= this.maxRequests) {
            const retryAfterSec = Math.max(1, Math.ceil((this.windowMs - (now - bucket.timestamps[0])) / 1000));
            res.setHeader("Retry-After", String(retryAfterSec));
            console.warn(`[rate-limit][${this.name}] IP ${resolveClientIp(req)} excedió ${this.maxRequests}/${this.windowMs}ms en ${req.method} ${req.path}`);
            res.status(429).json({
                ok: false,
                message: "Demasiadas solicitudes. Intenta de nuevo en unos momentos.",
                retryAfterSeconds: retryAfterSec,
            });
            return;
        }
        bucket.timestamps.push(now);
        this.buckets.set(key, bucket);
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
        limiter.middleware(req, res, next);
    };
}
//# sourceMappingURL=http-rate-limiter.util.js.map