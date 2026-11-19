import type { ConnectionOptions } from "bullmq";

export function isQueueEnabled(): boolean {
  return (
    process.env.QUEUE_ENABLED !== "false" &&
    Boolean(process.env.REDIS_URL?.trim())
  );
}

/** Conexión dedicada para BullMQ (sin keyPrefix de caché). */
export function getQueueRedisConnectionOptions(): ConnectionOptions | null {
  if (!isQueueEnabled()) return null;

  return {
    url: process.env.REDIS_URL!.trim(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
