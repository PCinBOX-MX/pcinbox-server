import { ensureRedisConnected } from "./redis.client";

function defaultTtlSec(): number {
  const parsed = Number(process.env.CATALOG_CACHE_TTL_SEC || 60);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  try {
    const redis = await ensureRedisConnected();
    if (!redis) return null;
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSec = defaultTtlSec(),
): Promise<void> {
  try {
    const redis = await ensureRedisConnected();
    if (!redis) return;
    await redis.set(key, JSON.stringify(value), "EX", ttlSec);
  } catch {
    // fail-open
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = await ensureRedisConnected();
    if (!redis) return;
    await redis.del(key);
  } catch {
    // fail-open
  }
}

export async function cacheDelByPrefix(prefix: string): Promise<void> {
  try {
    const redis = await ensureRedisConnected();
    if (!redis) return;

    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // fail-open
  }
}

export async function cacheSetNx(
  key: string,
  value: string,
  ttlSec: number,
): Promise<boolean> {
  try {
    const redis = await ensureRedisConnected();
    if (!redis) return false;
    const result = await redis.set(key, value, "EX", ttlSec, "NX");
    return result === "OK";
  } catch {
    return false;
  }
}
