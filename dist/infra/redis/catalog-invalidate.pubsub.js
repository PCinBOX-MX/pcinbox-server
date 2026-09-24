"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCatalogInvalidateChannel = getCatalogInvalidateChannel;
exports.publishCatalogInvalidation = publishCatalogInvalidation;
exports.startCatalogInvalidationSubscriber = startCatalogInvalidationSubscriber;
exports.stopCatalogInvalidationSubscriber = stopCatalogInvalidationSubscriber;
const ioredis_1 = __importDefault(require("ioredis"));
const redis_client_1 = require("./redis.client");
let publisher = null;
let subscriber = null;
/** Canal sin keyPrefix de servicio — compartido entre backends del mismo entorno. */
function getCatalogInvalidateChannel() {
    const explicit = process.env.REDIS_CATALOG_INVALIDATE_CHANNEL?.trim();
    if (explicit)
        return explicit;
    const redisEnv = process.env.REDIS_ENV?.trim() ||
        process.env.APP_ENV?.trim() ||
        "";
    if (redisEnv) {
        return `pcinbox:catalog:invalidate:${redisEnv}`;
    }
    // Deriva qa/prod del REDIS_KEY_PREFIX (ej. pcinbox:qa: → qa)
    const prefix = (0, redis_client_1.getRedisKeyPrefix)().replace(/:$/, "");
    const parts = prefix.split(":").filter(Boolean);
    const last = parts[parts.length - 1] || "shared";
    const ns = last === "qa" || last === "prod" || last === "local" || last === "dev"
        ? last
        : "shared";
    return `pcinbox:catalog:invalidate:${ns}`;
}
function createBareRedis() {
    if (!(0, redis_client_1.isRedisConfigured)())
        return null;
    return new ioredis_1.default(process.env.REDIS_URL.trim(), {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        connectTimeout: 5_000,
        retryStrategy(times) {
            if (times > 20)
                return null;
            return Math.min(times * 200, 2_000);
        },
    });
}
async function ensurePublisher() {
    if (!(0, redis_client_1.isRedisConfigured)())
        return null;
    if (!publisher) {
        publisher = createBareRedis();
        publisher?.on("error", (error) => {
            console.error(`[redis][catalog-invalidate:pub] ${error.message}`);
        });
    }
    if (!publisher)
        return null;
    if (publisher.status !== "ready") {
        try {
            await publisher.connect();
        }
        catch {
            return null;
        }
    }
    return publisher.status === "ready" ? publisher : null;
}
async function publishCatalogInvalidation(payload = {}) {
    try {
        const redis = await ensurePublisher();
        if (!redis)
            return false;
        const channel = getCatalogInvalidateChannel();
        await redis.publish(channel, JSON.stringify({
            ...payload,
            at: Date.now(),
        }));
        return true;
    }
    catch (error) {
        console.warn("[redis][catalog-invalidate] publish falló:", error instanceof Error ? error.message : error);
        return false;
    }
}
async function startCatalogInvalidationSubscriber(onMessage) {
    if (!(0, redis_client_1.isRedisConfigured)() || subscriber)
        return;
    const channel = getCatalogInvalidateChannel();
    subscriber = createBareRedis();
    if (!subscriber)
        return;
    subscriber.on("error", (error) => {
        console.error(`[redis][catalog-invalidate:sub] ${error.message}`);
    });
    try {
        await subscriber.connect();
        await subscriber.subscribe(channel);
        subscriber.on("message", (_ch, raw) => {
            let payload = {};
            try {
                payload = JSON.parse(raw);
            }
            catch {
                payload = { reason: "parse-error" };
            }
            void Promise.resolve(onMessage(payload)).catch((error) => {
                console.error("[redis][catalog-invalidate] handler error:", error instanceof Error ? error.message : error);
            });
        });
        console.log(`[redis][catalog-invalidate] Suscrito a ${channel}`);
    }
    catch (error) {
        console.error("[redis][catalog-invalidate] No se pudo suscribir:", error instanceof Error ? error.message : error);
    }
}
async function stopCatalogInvalidationSubscriber() {
    if (subscriber) {
        try {
            await subscriber.quit();
        }
        catch {
            subscriber.disconnect();
        }
        subscriber = null;
    }
    if (publisher) {
        try {
            await publisher.quit();
        }
        catch {
            publisher.disconnect();
        }
        publisher = null;
    }
}
//# sourceMappingURL=catalog-invalidate.pubsub.js.map