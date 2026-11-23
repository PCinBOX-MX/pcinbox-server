import { ensureRedisConnected } from "../infra/redis/redis.client";
import { formatRetryAfterHuman } from "./registerFakeAbuse.util";

/** Códigos enviados (registro + reenvío) antes del bloqueo por dispositivo/IP. */
export const REGISTER_CODE_MAX_SENDS = Number(
  process.env.REGISTER_CODE_MAX_SENDS || 5,
);

export const REGISTER_CODE_WINDOW_MS = Number(
  process.env.REGISTER_CODE_WINDOW_MS || 15 * 60 * 1000,
);

export const REGISTER_CODE_LOCKOUT_MS = Number(
  process.env.REGISTER_CODE_LOCKOUT_MS || 30 * 60 * 1000,
);

type MemoryState = {
  strikes: number[];
  lockedUntil: number | null;
};

const memoryByKey = new Map<string, MemoryState>();

function maxSends(): number {
  return Number.isFinite(REGISTER_CODE_MAX_SENDS) && REGISTER_CODE_MAX_SENDS > 0
    ? Math.floor(REGISTER_CODE_MAX_SENDS)
    : 5;
}

function windowMs(): number {
  return Number.isFinite(REGISTER_CODE_WINDOW_MS) && REGISTER_CODE_WINDOW_MS > 0
    ? REGISTER_CODE_WINDOW_MS
    : 15 * 60 * 1000;
}

function lockoutMs(): number {
  return Number.isFinite(REGISTER_CODE_LOCKOUT_MS) &&
    REGISTER_CODE_LOCKOUT_MS > 0
    ? REGISTER_CODE_LOCKOUT_MS
    : 30 * 60 * 1000;
}

function windowSec(): number {
  return Math.max(1, Math.ceil(windowMs() / 1000));
}

function lockoutSec(): number {
  return Math.max(1, Math.ceil(lockoutMs() / 1000));
}

function strikesRedisKey(key: string) {
  return `reg:code:strikes:${key}`;
}

function lockRedisKey(key: string) {
  return `reg:code:lock:${key}`;
}

function normalizePart(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .slice(0, 128);
}

function buildKeys(ipRaw: string, deviceIdRaw?: string | null): string[] {
  const keys: string[] = [];
  const ip = normalizePart(ipRaw) || "unknown";
  keys.push(`ip:${ip}`);
  const deviceId = normalizePart(deviceIdRaw);
  if (deviceId && deviceId !== "unknown") {
    keys.push(`dev:${deviceId}`);
  }
  return keys;
}

function getMemory(key: string): MemoryState {
  const existing = memoryByKey.get(key);
  if (existing) return existing;
  const created: MemoryState = { strikes: [], lockedUntil: null };
  memoryByKey.set(key, created);
  return created;
}

function pruneStrikes(state: MemoryState, now = Date.now()): number {
  const cutoff = now - windowMs();
  state.strikes = state.strikes.filter((ts) => ts >= cutoff);
  if (state.lockedUntil && state.lockedUntil <= now) {
    state.lockedUntil = null;
  }
  return state.strikes.length;
}

export type RegisterCodeSendAbuseStatus = {
  locked: boolean;
  retryAfterSec: number;
  sends: number;
  remainingSends: number;
};

export function buildRegisterCodeSendLockMessage(retryAfterSec: number): string {
  return `Demasiados códigos de verificación enviados desde este dispositivo. Espera ${formatRetryAfterHuman(retryAfterSec)} para volver a intentarlo.`;
}

async function statusForKey(key: string): Promise<RegisterCodeSendAbuseStatus> {
  const max = maxSends();

  try {
    const redis = await ensureRedisConnected();
    if (redis) {
      const ttl = await redis.ttl(lockRedisKey(key));
      if (ttl > 0) {
        return {
          locked: true,
          retryAfterSec: ttl,
          sends: max,
          remainingSends: 0,
        };
      }
      const raw = await redis.get(strikesRedisKey(key));
      const sends = Math.max(0, Number(raw || 0) || 0);
      return {
        locked: false,
        retryAfterSec: 0,
        sends,
        remainingSends: Math.max(0, max - sends),
      };
    }
  } catch {
    // memoria
  }

  const state = getMemory(key);
  const now = Date.now();
  const sends = pruneStrikes(state, now);
  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
      sends: max,
      remainingSends: 0,
    };
  }
  return {
    locked: false,
    retryAfterSec: 0,
    sends,
    remainingSends: Math.max(0, max - sends),
  };
}

async function recordForKey(key: string): Promise<RegisterCodeSendAbuseStatus> {
  const max = maxSends();

  try {
    const redis = await ensureRedisConnected();
    if (redis) {
      const existingTtl = await redis.ttl(lockRedisKey(key));
      if (existingTtl > 0) {
        return {
          locked: true,
          retryAfterSec: existingTtl,
          sends: max,
          remainingSends: 0,
        };
      }

      const count = await redis.incr(strikesRedisKey(key));
      if (count === 1) {
        await redis.expire(strikesRedisKey(key), windowSec());
      }

      if (count >= max) {
        await redis.set(lockRedisKey(key), "1", "EX", lockoutSec());
        await redis.del(strikesRedisKey(key));
        return {
          locked: true,
          retryAfterSec: lockoutSec(),
          sends: max,
          remainingSends: 0,
        };
      }

      return {
        locked: false,
        retryAfterSec: 0,
        sends: count,
        remainingSends: Math.max(0, max - count),
      };
    }
  } catch {
    // memoria
  }

  const state = getMemory(key);
  const now = Date.now();
  pruneStrikes(state, now);

  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
      sends: max,
      remainingSends: 0,
    };
  }

  state.strikes.push(now);
  const sends = pruneStrikes(state, now);
  if (sends >= max) {
    state.lockedUntil = now + lockoutMs();
    state.strikes = [];
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil(lockoutMs() / 1000)),
      sends: max,
      remainingSends: 0,
    };
  }

  return {
    locked: false,
    retryAfterSec: 0,
    sends,
    remainingSends: Math.max(0, max - sends),
  };
}

function mergeStatuses(
  statuses: RegisterCodeSendAbuseStatus[],
): RegisterCodeSendAbuseStatus {
  const max = maxSends();
  const locked = statuses.find((s) => s.locked);
  if (locked) {
    return {
      locked: true,
      retryAfterSec: Math.max(
        ...statuses.filter((s) => s.locked).map((s) => s.retryAfterSec),
        1,
      ),
      sends: max,
      remainingSends: 0,
    };
  }

  const sends = Math.max(0, ...statuses.map((s) => s.sends), 0);
  return {
    locked: false,
    retryAfterSec: 0,
    sends,
    remainingSends: Math.max(0, max - sends),
  };
}

export async function getRegisterCodeSendAbuseStatus(
  ip: string,
  deviceId?: string | null,
): Promise<RegisterCodeSendAbuseStatus> {
  const keys = buildKeys(ip, deviceId);
  const statuses = await Promise.all(keys.map((key) => statusForKey(key)));
  return mergeStatuses(statuses);
}

/** Cuenta un envío exitoso de código (registro o reenvío). */
export async function recordRegisterCodeSend(
  ip: string,
  deviceId?: string | null,
): Promise<RegisterCodeSendAbuseStatus> {
  const keys = buildKeys(ip, deviceId);
  const statuses = await Promise.all(keys.map((key) => recordForKey(key)));
  return mergeStatuses(statuses);
}
