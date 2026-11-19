import { Queue } from "bullmq";
import {
  getQueueRedisConnectionOptions,
  isQueueEnabled,
} from "../config/queue-redis";
import type { MailJobData } from "./mail.types";

export const MAIL_QUEUE_NAME = "pcinbox-mail";

let mailQueue: Queue<MailJobData, unknown, string> | null = null;

function getMailMaxAttempts(): number {
  const parsed = Number(process.env.MAIL_QUEUE_MAX_ATTEMPTS ?? 5);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function getMailQueue(): Queue<MailJobData, unknown, string> | null {
  if (!isQueueEnabled()) return null;

  const connection = getQueueRedisConnectionOptions();
  if (!connection) return null;

  if (!mailQueue) {
    mailQueue = new Queue<MailJobData, unknown, string>(MAIL_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: getMailMaxAttempts(),
        backoff: {
          type: "exponential",
          delay: 15_000,
        },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
  }

  return mailQueue;
}

export async function enqueueMailJob(data: MailJobData): Promise<boolean> {
  const queue = getMailQueue();
  if (!queue) return false;

  try {
    await queue.add(data.kind, data);
    const toLabel = Array.isArray(data.to) ? data.to.join(",") : data.to;
    console.log(`[queue][mail] Encolado kind=${data.kind} to=${toLabel}`);
    return true;
  } catch (error) {
    console.error(
      `[queue][mail] No se pudo encolar kind=${data.kind}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function closeMailQueue(): Promise<void> {
  if (!mailQueue) return;
  await mailQueue.close();
  mailQueue = null;
}
