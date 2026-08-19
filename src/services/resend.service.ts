import { Resend } from "resend";
import "../config/loadEnv";

function getResendClient() {
  const key = process.env.RESEND_KEY?.trim() || "";
  return new Resend(key);
}

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_process: "En Proceso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const getReservationStatusLabel = (status: string): string =>
  RESERVATION_STATUS_LABELS[status] || status;

function normalizeTemplateVariables(
  variables: Record<string, string | number>,
): Record<string, string | number> {
  // Resend templates suelen esperar strings en variables.
  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(variables || {})) {
    normalized[key] = typeof value === "number" ? String(value) : value;
  }
  return normalized;
}

export const sendEmailResend = async (
  to: string | string[],
  subject: string,
  idTemplate: string,
  variables: Record<string, string | number>,
): Promise<any> => {
  try {
    if (!process.env.RESEND_KEY?.trim()) {
      return {
        status: 400,
        error: "RESEND_KEY no está configurada en el servidor",
      };
    }
    if (!process.env.FROM_EMAIL?.trim()) {
      return {
        status: 400,
        error: "FROM_EMAIL no está configurada en el servidor",
      };
    }

    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: typeof to === "string" ? [to] : to,
      subject: subject,
      template: {
        id: idTemplate,
        variables: normalizeTemplateVariables(variables),
      },
    });
    if (error) {
      console.error("[sendEmailResend] Resend error:", {
        template: idTemplate,
        message: error?.message,
        error,
      });
      return {
        status: 400,
        error: error?.message,
      };
    }
  } catch (error: any) {
    console.error("[sendEmailResend] exception:", error?.message || error);
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
    const resend = getResendClient();
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
  productDescription?: string | null;
  productUpc?: string | null;
  productSku?: string | null;
  quantity?: number;
  licenseKeys: string[];
  instructions?: string;
  productImageUrl?: string | null;
  platformUrl?: string | null;
};

const DEFAULT_LICENSE_INSTRUCTIONS =
  "Activa tu producto con la clave indicada. Si el fabricante requiere descarga, usa su portal oficial. Conserva este correo como comprobante de tu licencia PCinBOX.";

const PCINBOX_LOGO_URL =
  "https://ik.imagekit.io/pcinboxkit/logos/logo.png?updatedAt=1759534318587";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resolveProductImageUrl(raw: unknown): string | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.startsWith("http") ? trimmed : null;
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const resolved = resolveProductImageUrl(item);
      if (resolved) return resolved;
    }
    return null;
  }

  return null;
}

/** Una caja HTML por clave. */
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

/** Filas opcionales del detalle de producto (UPC, SKU, descripción). */
function buildProductMetaRowsHtml(params: {
  productUpc?: string | null;
  productSku?: string | null;
  productDescription?: string | null;
}): string {
  const rows: string[] = [];

  if (params.productUpc) {
    rows.push(`
      <tr>
        <td style="padding:6px 0;color:#6b7280;width:120px;vertical-align:top;">UPC</td>
        <td style="padding:6px 0;"><strong>${escapeHtml(params.productUpc)}</strong></td>
      </tr>`);
  }

  if (params.productSku) {
    rows.push(`
      <tr>
        <td style="padding:6px 0;color:#6b7280;width:120px;vertical-align:top;">SKU</td>
        <td style="padding:6px 0;"><strong>${escapeHtml(params.productSku)}</strong></td>
      </tr>`);
  }

  if (params.productDescription) {
    rows.push(`
      <tr>
        <td style="padding:6px 0;color:#6b7280;width:120px;vertical-align:top;">Descripción</td>
        <td style="padding:6px 0;color:#374151;line-height:1.5;">${escapeHtml(params.productDescription)}</td>
      </tr>`);
  }

  return rows.join("");
}

function buildLicenseEmailHtml(params: {
  customerName: string;
  idOrder: number | string;
  productName: string;
  productDescription?: string | null;
  productUpc?: string | null;
  productSku?: string | null;
  quantity: number;
  keysLabel: string;
  licenseKeysHtml: string;
  instructions: string;
  productImageUrl: string | null;
  platformUrl: string;
}): string {
  const safeName = escapeHtml(params.customerName);
  const safeOrder = escapeHtml(String(params.idOrder));
  const safeProduct = escapeHtml(params.productName);
  const safeInstructions = escapeHtml(params.instructions);
  const safePlatformUrl = escapeHtml(params.platformUrl);
  const keysLabel = escapeHtml(params.keysLabel);
  const quantity = Math.max(1, params.quantity);
  const productMetaRows = buildProductMetaRowsHtml({
    productUpc: params.productUpc ?? null,
    productSku: params.productSku ?? null,
    productDescription: params.productDescription ?? null,
  });

  const productImageBlock = params.productImageUrl
    ? `<tr>
        <td align="center" style="padding:0 0 16px 0;">
          <img src="${escapeHtml(params.productImageUrl)}" alt="${escapeHtml(params.productName)}" width="120" height="120" style="display:block;width:120px;height:120px;object-fit:contain;border-radius:12px;border:1px solid #e5e7eb;background:#ffffff;" />
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu licencia digital PCinbox</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="background:#bb3d4b;padding:16px 24px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.02em;">Tu licencia digital PCinbox</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px 24px 8px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${productImageBlock}
                <tr>
                  <td align="center" style="padding:0 0 20px 0;">
                    <img src="${PCINBOX_LOGO_URL}" alt="PCinBOX" width="160" style="display:block;width:160px;max-width:100%;height:auto;" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 0 12px 0;">
                    <h1 style="margin:0;font-size:28px;line-height:1.2;color:#111827;">¡Pago confirmado!</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px 0;font-size:15px;line-height:1.6;color:#374151;text-align:center;">
                    Hola <strong>${safeName}</strong>, gracias por tu compra. El equipo PCinBOX te envía la información de activación
                    (${quantity === 1 ? "1 clave de activación" : `${quantity} claves de activación`}).
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">Detalle del pedido</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;width:120px;">Pedido</td>
                        <td style="padding:6px 0;"><strong>#${safeOrder}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;width:120px;">Producto</td>
                        <td style="padding:6px 0;"><strong>${safeProduct}</strong></td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;width:120px;">Licencias</td>
                        <td style="padding:6px 0;"><strong>${quantity}</strong></td>
                      </tr>
                      ${productMetaRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #f3c4c9;border-radius:12px;background:#fff5f6;">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0 0 14px 0;font-size:12px;font-weight:700;color:#bb3d4b;letter-spacing:0.08em;text-transform:uppercase;">${keysLabel}</p>
                    ${params.licenseKeysHtml}
                    <p style="margin:18px 0 8px 0;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">Instrucciones</p>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">${safeInstructions}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">
                Conserva este correo. Si tienes problemas para activar, contacta a soporte indicando el pedido #${safeOrder}.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#ffffff;padding:0 24px 28px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
              <a href="${safePlatformUrl}" style="display:inline-block;background:#bb3d4b;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;">Ir a la plataforma</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 8px 0 8px;font-size:12px;color:#9ca3af;">
              © ${new Date().getFullYear()} PCinBOX Bajío. Todos los derechos reservados.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Correo de entrega digital con HTML inline (1..N claves). */
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

  if (!process.env.RESEND_KEY?.trim()) {
    return {
      status: 400,
      error: "RESEND_KEY no está configurada en el servidor",
    };
  }

  if (!process.env.FROM_EMAIL?.trim()) {
    return {
      status: 400,
      error: "FROM_EMAIL no está configurada en el servidor",
    };
  }

  const instructions =
    String(params.instructions || "").trim() || DEFAULT_LICENSE_INSTRUCTIONS;

  const keyCount = keys.length;
  const quantity = Math.max(1, Number(params.quantity) || keyCount);
  const keysLabel =
    keyCount === 1 ? "Clave de activación" : "Claves de activación";
  const productImageUrl = resolveProductImageUrl(params.productImageUrl);
  const platformUrl =
    String(params.platformUrl || process.env.BASE_URL_APP || "").trim() ||
    "https://pcinbox.com.mx";

  const html = buildLicenseEmailHtml({
    customerName: String(params.customerName || "cliente").trim() || "cliente",
    idOrder: params.idOrder,
    productName: String(params.productName || "Licencia digital").trim(),
    productDescription: params.productDescription ?? null,
    productUpc: params.productUpc ?? null,
    productSku: params.productSku ?? null,
    quantity,
    keysLabel,
    licenseKeysHtml: buildLicenseKeysHtml(keys),
    instructions,
    productImageUrl,
    platformUrl,
  });

  const subject =
    keyCount === 1
      ? `Tu licencia PCInbox — Pedido #${params.idOrder}`
      : `Tus ${keyCount} licencias PCInbox — Pedido #${params.idOrder}`;

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("[sendLicenseKeyEmail] Resend error:", error?.message, error);
      return {
        status: 400,
        error: error?.message,
      };
    }
  } catch (error: any) {
    console.error("[sendLicenseKeyEmail] exception:", error?.message || error);
    return {
      status: 400,
      error: error?.message,
    };
  }
};
