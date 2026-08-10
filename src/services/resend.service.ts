import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config({ path: ".env.prod" });

const resend = new Resend(process?.env?.RESEND_KEY || "");

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_process: "En Proceso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const getReservationStatusLabel = (status: string): string =>
  RESERVATION_STATUS_LABELS[status] || status;

export const sendEmailResend = async (
  to: string | string[],
  subject: string,
  idTemplate: string,
  variables: Record<string, string | number>,
): Promise<any> => {
  try {
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: typeof to === "string" ? [to] : to,
      subject: subject,
      template: {
        id: idTemplate,
        variables,
      },
    });
    if (error) {
      return {
        status: 400,
        error: error?.message,
      };
    }
  } catch (error: any) {
    return {
      status: 400,
      error: error?.message,
    };
  }
};

type ReservationStatusEmailParams = {
  contactName: string;
  reference: string;
  status: string;
  statusText: string;
  statusReason?: string;
  statusMessage: string;
  appointmentDate: string;
  appointmentTime: string;
  deviceType: string;
  service: string;
  detailUrl: string;
};

export const getReservationStatusMessage = (status: string): string => {
  const messages: Record<string, string> = {
    pending:
      "Tu cita sigue registrada y pendiente de atención. Te esperamos en la fecha y hora acordadas.",
    in_process:
      "Tu equipo ya está siendo atendido en nuestro taller. Te avisaremos cuando el servicio avance.",
    completed:
      "El servicio de mantenimiento ha sido completado. Ya puedes pasar a recoger tu equipo.",
    cancelled: "",
  };

  return messages[status] || "Tu reserva ha sido actualizada.";
};

export const sendReservationStatusUpdateEmail = async (
  to: string,
  params: ReservationStatusEmailParams,
): Promise<any> => {
  const {
    contactName,
    reference,
    status,
    statusText,
    statusReason,
    statusMessage,
    appointmentDate,
    appointmentTime,
    deviceType,
    service,
    detailUrl,
  } = params;

  const isCancelled = status === "cancelled";
  const reasonRow =
    isCancelled && statusReason
      ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Motivo de cancelación</td>
            <td style="padding: 8px 0;"><strong>${statusReason}</strong></td>
          </tr>`
      : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <div style="background: #bb3d4b; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; color: #fff; font-size: 22px;">Actualización de tu cita</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px;">Hola <strong>${contactName}</strong>,</p>
        <p style="margin: 0 0 20px;">
          Tu reserva de mantenimiento <strong>${reference}</strong> cambió de estatus a
          <strong style="color: #bb3d4b;">${statusText}</strong>.
        </p>
        <p style="margin: 0 0 20px; color: #4b5563; line-height: 1.5;">
          ${statusMessage}
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 160px;">Estatus</td>
            <td style="padding: 8px 0;"><strong>${statusText}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Servicio</td>
            <td style="padding: 8px 0;"><strong>${service}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Equipo</td>
            <td style="padding: 8px 0;"><strong>${deviceType}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Fecha de cita</td>
            <td style="padding: 8px 0;"><strong>${appointmentDate}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Hora</td>
            <td style="padding: 8px 0;"><strong>${appointmentTime}</strong></td>
          </tr>
          ${reasonRow}
        </table>
        <p style="margin: 0 0 20px; color: #4b5563;">
          Puedes consultar el detalle de tu reserva en cualquier momento con tu folio:
        </p>
        <a href="${detailUrl}" style="display: inline-block; background: #bb3d4b; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold;">
          Ver mi reserva
        </a>
        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
          Si no solicitaste esta cita, puedes ignorar este correo o contactarnos.
        </p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: [to],
      subject: `Actualización de tu cita - ${statusText} (${reference})`,
      html,
    });

    if (error) {
      return {
        status: 400,
        error: error?.message,
      };
    }
  } catch (error: any) {
    return {
      status: 400,
      error: error?.message,
    };
  }
};

export type LicenseKeyEmailParams = {
  customerName: string;
  idOrder: number | string;
  productName: string;
  licenseKeys: string[];
  instructions?: string;
};

const LICENSE_CLIENT_TEMPLATE_ID = "license-client";

const DEFAULT_LICENSE_INSTRUCTIONS =
  "Usa la clave para activar tu producto. Si el fabricante requiere descarga, utiliza su portal oficial. Conserva este correo como comprobante.";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Una caja HTML por clave (para {{{LICENSE_KEYS_HTML}}} en Resend). */
function buildLicenseKeysHtml(keys: string[]): string {
  const wrapKeys =
    "word-break: break-all; overflow-wrap: anywhere; word-wrap: break-word; -ms-word-break: break-all;";

  return keys
    .map((key, index) => {
      const label =
        keys.length > 1
          ? `<p style="margin:0 0 6px;font-size:11px;font-weight:bold;color:#bb3d4b;text-transform:uppercase;letter-spacing:0.05em;">Clave ${index + 1} de ${keys.length}</p>`
          : "";

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;margin:0 0 10px 0;">
  <tr>
    <td width="100%" style="padding:12px 14px;background-color:#ffffff;border:1px dashed #d1d5db;border-radius:8px;font-family:Consolas,Monaco,monospace;font-size:14px;letter-spacing:0.2px;line-height:1.45;color:#222;${wrapKeys}">
      ${label}${escapeHtml(key)}
    </td>
  </tr>
</table>`;
    })
    .join("");
}

/** Correo de entrega digital vía plantilla Resend `license-client` (1..N claves). */
export const sendLicenseKeyEmail = async (
  to: string,
  params: LicenseKeyEmailParams,
): Promise<{ status?: number; error?: string } | void> => {
  const keys = (params.licenseKeys || [])
    .map((key) => String(key || "").trim())
    .filter(Boolean);

  if (!keys.length) {
    return { status: 400, error: "Debes indicar al menos una clave" };
  }

  const instructions =
    String(params.instructions || "").trim() || DEFAULT_LICENSE_INSTRUCTIONS;

  const keyCount = keys.length;
  const keysLabel =
    keyCount === 1 ? "Clave de activación" : "Claves de activación";

  return sendEmailResend(
    to,
    keyCount === 1
      ? `Tu licencia PCInbox — Pedido #${params.idOrder}`
      : `Tus ${keyCount} licencias PCInbox — Pedido #${params.idOrder}`,
    LICENSE_CLIENT_TEMPLATE_ID,
    {
      NAME: String(params.customerName || "cliente").trim() || "cliente",
      ORDER_ID: String(params.idOrder),
      PRODUCT_NAME: String(params.productName || "Licencia digital").trim(),
      KEY_COUNT: keyCount,
      KEYS_LABEL: keysLabel,
      // Texto plano (fallback): una clave por línea.
      LICENSE_KEY: keys.join("\n"),
      // HTML por clave (preferido en plantilla con {{{LICENSE_KEYS_HTML}}}).
      LICENSE_KEYS_HTML: buildLicenseKeysHtml(keys),
      INSTRUCTIONS: instructions,
    },
  );
};
