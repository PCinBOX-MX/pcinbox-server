"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReservationStatusUpdateEmail = exports.getReservationStatusMessage = exports.sendEmailResend = exports.getReservationStatusLabel = exports.RESERVATION_STATUS_LABELS = void 0;
const resend_1 = require("resend");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: ".env.prod" });
const resend = new resend_1.Resend(process?.env?.RESEND_KEY || "");
exports.RESERVATION_STATUS_LABELS = {
    pending: "Pendiente",
    in_process: "En Proceso",
    completed: "Completada",
    cancelled: "Cancelada",
};
const getReservationStatusLabel = (status) => exports.RESERVATION_STATUS_LABELS[status] || status;
exports.getReservationStatusLabel = getReservationStatusLabel;
const sendEmailResend = async (to, subject, idTemplate, variables) => {
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
    }
    catch (error) {
        return {
            status: 400,
            error: error?.message,
        };
    }
};
exports.sendEmailResend = sendEmailResend;
const getReservationStatusMessage = (status) => {
    const messages = {
        pending: "Tu cita sigue registrada y pendiente de atención. Te esperamos en la fecha y hora acordadas.",
        in_process: "Tu equipo ya está siendo atendido en nuestro taller. Te avisaremos cuando el servicio avance.",
        completed: "El servicio de mantenimiento ha sido completado. Ya puedes pasar a recoger tu equipo.",
        cancelled: "",
    };
    return messages[status] || "Tu reserva ha sido actualizada.";
};
exports.getReservationStatusMessage = getReservationStatusMessage;
const sendReservationStatusUpdateEmail = async (to, params) => {
    const { contactName, reference, status, statusText, statusReason, statusMessage, appointmentDate, appointmentTime, deviceType, service, detailUrl, } = params;
    const isCancelled = status === "cancelled";
    const reasonRow = isCancelled && statusReason
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
    }
    catch (error) {
        return {
            status: 400,
            error: error?.message,
        };
    }
};
exports.sendReservationStatusUpdateEmail = sendReservationStatusUpdateEmail;
//# sourceMappingURL=resend.service.js.map