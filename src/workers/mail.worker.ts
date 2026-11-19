import { Job, Worker } from "bullmq";
import {
  getQueueRedisConnectionOptions,
  isQueueEnabled,
} from "../config/queue-redis";
import { MAIL_QUEUE_NAME } from "../queues/mail.queue";
import type { MailJobData } from "../queues/mail.types";
import {
  sendEmailResend,
  sendReservationStatusUpdateEmail,
} from "../services/resend.service";

let mailWorker: Worker<MailJobData, unknown, string> | null = null;

function getMailConcurrency(): number {
  const parsed = Number(process.env.MAIL_QUEUE_CONCURRENCY ?? 3);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

function assertMailOk(result: unknown, label: string): void {
  if (
    result &&
    typeof result === "object" &&
    "status" in result &&
    (result as { status?: number }).status === 400
  ) {
    const error =
      (result as { error?: string }).error || "Error enviando correo";
    throw new Error(`[worker][mail] ${label}: ${error}`);
  }
}

async function handleMailJob(job: Job<MailJobData>): Promise<void> {
  const data = job.data;

  if (data.kind === "template") {
    const result = await sendEmailResend(
      data.to,
      data.subject,
      data.templateId,
      data.variables,
    );
    assertMailOk(result, `template=${data.templateId}`);
    return;
  }

  if (data.kind === "reservation-status") {
    const result = await sendReservationStatusUpdateEmail(data.to, data.params);
    assertMailOk(result, "reservation-status");
    return;
  }

  throw new Error(`[worker][mail] kind desconocido`);
}

export async function startMailWorker(): Promise<void> {
  if (!isQueueEnabled() || mailWorker) return;

  const connection = getQueueRedisConnectionOptions();
  if (!connection) {
    console.warn("[worker][mail] Redis no disponible; worker no iniciado.");
    return;
  }

  mailWorker = new Worker<MailJobData, unknown, string>(
    MAIL_QUEUE_NAME,
    handleMailJob,
    {
      connection,
      concurrency: getMailConcurrency(),
    },
  );

  mailWorker.on("completed", (job) => {
    console.log(
      `[worker][mail] Job ${job.id} completado kind=${job.data.kind}`,
    );
  });

  mailWorker.on("failed", (job, error) => {
    console.error(
      `[worker][mail] Job ${job?.id ?? "n/a"} falló kind=${job?.data.kind ?? "n/a"}:`,
      error.message,
    );
  });

  console.log(
    `[worker][mail] Worker activo (concurrency=${getMailConcurrency()}).`,
  );
}

export async function stopMailWorker(): Promise<void> {
  if (!mailWorker) return;
  await mailWorker.close();
  mailWorker = null;
}
