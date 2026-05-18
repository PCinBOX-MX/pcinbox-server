"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailResend = void 0;
const resend_1 = require("resend");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: ".env.prod" });
const resend = new resend_1.Resend(process?.env?.RESEND_KEY || "");
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
//# sourceMappingURL=resend.service.js.map