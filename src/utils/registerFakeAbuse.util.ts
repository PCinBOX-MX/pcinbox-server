import { ensureRedisConnected } from "../infra/redis/redis.client";

/** Intentos fallidos (correo temporal / dominio inválido) antes del bloqueo. */
export const REGISTER_FAKE_MAX_ATTEMPTS = Number(
  process.env.REGISTER_FAKE_MAX_ATTEMPTS || 5,
);

/** Ventana para acumular strikes. */
export const REGISTER_FAKE_WINDOW_MS = Number(
  process.env.REGISTER_FAKE_WINDOW_MS || 10 * 60 * 1000,
);

/** Duración del bloqueo tras alcanzar el máximo. */
export const REGISTER_FAKE_LOCKOUT_MS = Number(
  process.env.REGISTER_FAKE_LOCKOUT_MS || 30 * 60 * 1000,
);

type MemoryState = {
  strikes: number[];
  lockedUntil: number | null;
};

const memoryByIp = new Map<string, MemoryState>();

function maxAttempts(): number {
  return Number.isFinite(REGISTER_FAKE_MAX_ATTEMPTS) &&
    REGISTER_FAKE_MAX_ATTEMPTS > 0
    ? Math.floor(REGISTER_FAKE_MAX_ATTEMPTS)
    : 5;
}

function windowMs(): number {
  return Number.isFinite(REGISTER_FAKE_WINDOW_MS) && REGISTER_FAKE_WINDOW_MS > 0
    ? REGISTER_FAKE_WINDOW_MS
    : 10 * 60 * 1000;
}

function lockoutMs(): number {
  return Number.isFinite(REGISTER_FAKE_LOCKOUT_MS) && REGISTER_FAKE_LOCKOUT_MS > 0
    ? REGISTER_FAKE_LOCKOUT_MS
    : 30 * 60 * 1000;
}

function windowSec(): number {
  return Math.max(1, Math.ceil(windowMs() / 1000));
}

function lockoutSec(): number {
  return Math.max(1, Math.ceil(lockoutMs() / 1000));
}

function strikesKey(ip: string) {
  return `reg:fake:strikes:${ip}`;
}

function lockKey(ip: string) {
  return `reg:fake:lock:${ip}`;
}

function normalizeIp(ip: string | undefined | null): string {
  const value = String(ip || "").trim();
  return value || "unknown";
}

function getMemory(ip: string): MemoryState {
  const existing = memoryByIp.get(ip);
  if (existing) return existing;
  const created: MemoryState = { strikes: [], lockedUntil: null };
  memoryByIp.set(ip, created);
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

export function formatRetryAfterHuman(retryAfterSec: number): string {
  const sec = Math.max(1, Math.ceil(retryAfterSec));
  if (sec < 60) return `${sec} segundo${sec === 1 ? "" : "s"}`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} minuto${min === 1 ? "" : "s"}`;
  const hours = Math.ceil(min / 60);
  return `${hours} hora${hours === 1 ? "" : "s"}`;
}

export function buildRegisterLockMessage(retryAfterSec: number): string {
  return `Demasiados intentos con correos no válidos. Espera ${formatRetryAfterHuman(retryAfterSec)} para volver a intentarlo.`;
}

export type RegisterFakeAbuseStatus = {
  locked: boolean;
  retryAfterSec: number;
  strikes: number;
  remainingAttempts: number;
};

async function readRedisLock(ip: string): Promise<number | null> {
  const redis = await ensureRedisConnected();
  if (!redis) return null;
  const ttl = await redis.ttl(lockKey(ip));
  if (ttl > 0) return ttl;
  return 0;
}

async function readRedisStrikes(ip: string): Promise<number | null> {
  const redis = await ensureRedisConnected();
  if (!redis) return null;
  const raw = await redis.get(strikesKey(ip));
  const count = Number(raw || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export async function getRegisterFakeAbuseStatus(
  ipRaw: string,
): Promise<RegisterFakeAbuseStatus> {
  const ip = normalizeIp(ipRaw);
  const max = maxAttempts();

  try {
    const redisTtl = await readRedisLock(ip);
    if (redisTtl === null) {
      // Redis no disponible → memoria
    } else if (redisTtl > 0) {
      return {
        locked: true,
        retryAfterSec: redisTtl,
        strikes: max,
        remainingAttempts: 0,
      };
    } else {
      const strikes = (await readRedisStrikes(ip)) ?? 0;
      return {
        locked: false,
        retryAfterSec: 0,
        strikes,
        remainingAttempts: Math.max(0, max - strikes),
      };
    }
  } catch {
    // fallback memoria
  }

  const state = getMemory(ip);
  const now = Date.now();
  const strikes = pruneStrikes(state, now);
  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
      strikes: max,
      remainingAttempts: 0,
    };
  }

  return {
    locked: false,
    retryAfterSec: 0,
    strikes,
    remainingAttempts: Math.max(0, max - strikes),
  };
}

export async function recordRegisterFakeFailure(
  ipRaw: string,
): Promise<RegisterFakeAbuseStatus> {
  const ip = normalizeIp(ipRaw);
  const max = maxAttempts();

  try {
    const redis = await ensureRedisConnected();
    if (redis) {
      const existingTtl = await redis.ttl(lockKey(ip));
      if (existingTtl > 0) {
        return {
          locked: true,
          retryAfterSec: existingTtl,
          strikes: max,
          remainingAttempts: 0,
        };
      }

      const count = await redis.incr(strikesKey(ip));
      if (count === 1) {
        await redis.expire(strikesKey(ip), windowSec());
      }

      if (count >= max) {
        await redis.set(lockKey(ip), "1", "EX", lockoutSec());
        await redis.del(strikesKey(ip));
        return {
          locked: true,
          retryAfterSec: lockoutSec(),
          strikes: max,
          remainingAttempts: 0,
        };
      }

      return {
        locked: false,
        retryAfterSec: 0,
        strikes: count,
        remainingAttempts: Math.max(0, max - count),
      };
    }
  } catch {
    // fallback memoria
  }

  const state = getMemory(ip);
  const now = Date.now();
  pruneStrikes(state, now);

  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
      strikes: max,
      remainingAttempts: 0,
    };
  }

  state.strikes.push(now);
  const strikes = pruneStrikes(state, now);

  if (strikes >= max) {
    state.lockedUntil = now + lockoutMs();
    state.strikes = [];
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil(lockoutMs() / 1000)),
      strikes: max,
      remainingAttempts: 0,
    };
  }

  return {
    locked: false,
    retryAfterSec: 0,
    strikes,
    remainingAttempts: Math.max(0, max - strikes),
  };
}

/** Limpia strikes tras un correo válido (no levanta un bloqueo activo). */
export async function clearRegisterFakeStrikes(ipRaw: string): Promise<void> {
  const ip = normalizeIp(ipRaw);

  try {
    const redis = await ensureRedisConnected();
    if (redis) {
      await redis.del(strikesKey(ip));
      return;
    }
  } catch {
    // fallback memoria
  }

  const state = memoryByIp.get(ip);
  if (state) state.strikes = [];
}
