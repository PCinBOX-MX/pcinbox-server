"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheGetJson = cacheGetJson;
exports.cacheSetJson = cacheSetJson;
exports.cacheDel = cacheDel;
exports.cacheDelByPrefix = cacheDelByPrefix;
exports.cacheSetNx = cacheSetNx;
const redis_client_1 = require("./redis.client");
function defaultTtlSec() {
    const parsed = Number(process.env.CATALOG_CACHE_TTL_SEC || 60);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}
async function cacheGetJson(key) {
    try {
        const redis = await (0, redis_client_1.ensureRedisConnected)();
        if (!redis)
            return null;
        const raw = await redis.get(key);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function cacheSetJson(key, value, ttlSec = defaultTtlSec()) {
    try {
        const redis = await (0, redis_client_1.ensureRedisConnected)();
        if (!redis)
            return;
        await redis.set(key, JSON.stringify(value), "EX", ttlSec);
    }
    catch {
        // fail-open
    }
}
async function cacheDel(key) {
    try {
        const redis = await (0, redis_client_1.ensureRedisConnected)();
        if (!redis)
            return;
        await redis.del(key);
    }
    catch {
        // fail-open
    }
}
async function cacheDelByPrefix(prefix) {
    try {
        const redis = await (0, redis_client_1.ensureRedisConnected)();
        if (!redis)
            return;
        let cursor = "0";
        do {
            const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
            cursor = next;
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== "0");
    }
    catch {
        // fail-open
    }
}
async function cacheSetNx(key, value, ttlSec) {
    try {
        const redis = await (0, redis_client_1.ensureRedisConnected)();
        if (!redis)
            return false;
        const result = await redis.set(key, value, "EX", ttlSec, "NX");
        return result === "OK";
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=cache.util.js.map