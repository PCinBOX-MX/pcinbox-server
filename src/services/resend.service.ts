import { Resend } from "resend";
import "../config/loadEnv";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_KEY?.trim();
  if (!apiKey) {
    console.warn("[resend] RESEND_KEY no configurada; correo no enviado.");
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

export const sendEmailResend = async (
  to: string | string[],
  subject: string,
  idTemplate: string,
  variables: Record<string, string | number>,
): Promise<any> => {
  try {
    const resend = getResendClient();
    if (!resend) {
      return {
        status: 400,
        error: "Resend no configurado: falta RESEND_KEY",
      };
    }

    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: typeof to === "string" ? [to] : to,
      subject,
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
