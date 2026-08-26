"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRedisConfigured = isRedisConfigured;
exports.getRedisKeyPrefix = getRedisKeyPrefix;
exports.getRedisClient = getRedisClient;
exports.ensureRedisConnected = ensureRedisConnected;
exports.redisPing = redisPing;
exports.closeRedisClient = closeRedisClient;
const ioredis_1 = __importDefault(require("ioredis"));
let client = null;
let connectPromise = null;
function isRedisConfigured() {
    return Boolean(process.env.REDIS_URL?.trim());
}
function getRedisKeyPrefix() {
    return process.env.REDIS_KEY_PREFIX?.trim() || "pcinbox:";
}
function getStatus(redis) {
    return redis.status;
}
function getRedisClient() {
    if (!isRedisConfigured())
        return null;
    if (!client) {
        client = new ioredis_1.default(process.env.REDIS_URL.trim(), {
            lazyConnect: true,
            maxRetriesPerRequest: 2,
            enableReadyCheck: true,
            connectTimeout: 5_000,
            keyPrefix: getRedisKeyPrefix(),
            retryStrategy(times) {
                if (times > 20)
                    return null;
                return Math.min(times * 200, 2_000);
            },
        });
        client.on("error", (error) => {
            console.error(`[redis][pcinbox-server] ${error.message}`);
        });
        client.on("connect", () => {
            console.log("[redis][pcinbox-server] Conectado");
        });
    }
    return client;
}
async function ensureRedisConnected() {
    const redis = getRedisClient();
    if (!redis)
        return null;
    const status = getStatus(redis);
    if (status === "ready")
        return redis;
    if (status === "connecting" || status === "reconnecting") {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return getStatus(redis) === "ready" ? redis : null;
    }
    if (!connectPromise) {
        connectPromise = redis
            .connect()
            .then(() => redis)
            .catch((error) => {
            console.error(`[redis][pcinbox-server] No se pudo conectar: ${error instanceof Error ? error.message : error}`);
            return null;
        })
            .finally(() => {
            connectPromise = null;
        });
    }
    return connectPromise;
}
async function redisPing() {
    try {
        const redis = await ensureRedisConnected();
        if (!redis)
            return false;
        return (await redis.ping()) === "PONG";
    }
    catch {
        return false;
    }
}
async function closeRedisClient() {
    if (!client)
        return;
    const current = client;
    client = null;
    connectPromise = null;
    try {
        await current.quit();
    }
    catch {
        current.disconnect();
    }
}
//# sourceMappingURL=redis.client.js.map