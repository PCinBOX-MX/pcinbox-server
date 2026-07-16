import "../config/loadEnv";
import sgMail from "@sendgrid/mail";
export declare const sendMail: (resetLink: string, userName: string, toEmail: string) => Promise<[sgMail.ClientResponse, {}]>;
export declare const SendEmailWelcomeUser: (nameUser: string, toEmail: string) => Promise<[sgMail.ClientResponse, {}]>;
//# sourceMappingURL=sendgrid.service.d.ts.map