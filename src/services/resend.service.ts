import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config({ path: ".env.prod" });

const resend = new Resend(process?.env?.RESEND_KEY || "");

export const sendEmailResend = async (
  to: string | string[],
  subject: string,
  idTemplate: string,
  variables: Record<string, string | number>,
): Promise<any> => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: typeof to === "string" ? [to] : to,
      subject: subject,
      template: {
        id: idTemplate,
        variables,
      },
    });
    console.log("error", error);
    console.log("data", data);
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
