import Redis from "ioredis";

let client: Redis | null = null;
let connectPromise: Promise<Redis | null> | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

export function getRedisKeyPrefix(): string {
  return process.env.REDIS_KEY_PREFIX?.trim() || "pcinbox:";
}

function getStatus(redis: Redis): string {
  return redis.status;
}

export function getRedisClient(): Redis | null {
  if (!isRedisConfigured()) return null;

  if (!client) {
    client = new Redis(process.env.REDIS_URL!.trim(), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      connectTimeout: 5_000,
      keyPrefix: getRedisKeyPrefix(),
      retryStrategy(times) {
        if (times > 20) return null;
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

export async function ensureRedisConnected(): Promise<Redis | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const status = getStatus(redis);
  if (status === "ready") return redis;

  if (status === "connecting" || status === "reconnecting") {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return getStatus(redis) === "ready" ? redis : null;
  }

  if (!connectPromise) {
    connectPromise = redis
      .connect()
      .then(() => redis)
      .catch((error) => {
        console.error(
          `[redis][pcinbox-server] No se pudo conectar: ${
            error instanceof Error ? error.message : error
          }`,
        );
        return null;
      })
      .finally(() => {
        connectPromise = null;
      });
  }

  return connectPromise;
}

export async function redisPing(): Promise<boolean> {
  try {
    const redis = await ensureRedisConnected();
    if (!redis) return false;
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedisClient(): Promise<void> {
  if (!client) return;
  const current = client;
  client = null;
  connectPromise = null;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
