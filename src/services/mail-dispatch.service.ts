import { enqueueMailJob } from "../queues/mail.queue";
import type { ReservationStatusMailJob } from "../queues/mail.types";
import {
  sendEmailResend,
  sendReservationStatusUpdateEmail,
} from "./resend.service";

type DispatchResult = {
  status?: number;
  error?: string;
  queued?: boolean;
};

/**
 * Encola el correo en BullMQ si Redis/QUEUE están activos.
 * Si no, envía en el request (fallback sync) para no romper QA/local.
 */
export async function dispatchTemplateEmail(
  to: string | string[],
  subject: string,
  templateId: string,
  variables: Record<string, string | number>,
): Promise<DispatchResult> {
  const queued = await enqueueMailJob({
    kind: "template",
    to,
    subject,
    templateId,
    variables,
  });

  if (queued) return { queued: true };

  return (await sendEmailResend(to, subject, templateId, variables)) as DispatchResult;
}

export async function dispatchReservationStatusEmail(
  to: string,
  params: ReservationStatusMailJob["params"],
): Promise<DispatchResult> {
  const queued = await enqueueMailJob({
    kind: "reservation-status",
    to,
    params,
  });

  if (queued) return { queued: true };

  return (await sendReservationStatusUpdateEmail(to, params)) as DispatchResult;
}
