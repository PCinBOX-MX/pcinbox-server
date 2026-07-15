"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendEmailWelcomeUser = exports.sendMail = void 0;
require("../config/loadEnv");
const mail_1 = __importDefault(require("@sendgrid/mail"));
const ejs_1 = __importDefault(require("ejs"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
mail_1.default.setApiKey(process.env.KEY_SENDGRID || "");
const sendMail = async (resetLink, userName, toEmail) => {
    const pathHtml = path_1.default.resolve(__dirname, "../../src/views/linkResetPasswordHtml.ejs");
    if (!fs_1.default.existsSync(pathHtml)) {
        throw new Error(`No se encontró la plantilla en: ${pathHtml}`);
    }
    const linkResetPasswordHtml = fs_1.default.readFileSync(pathHtml, "utf-8");
    const html = ejs_1.default.render(linkResetPasswordHtml, {
        username: userName,
        resetLink: resetLink,
        urlCandado: process.env.URL_CANDADO,
    });
    const msg = {
        from: process.env.FROM_EMAIL || "",
        to: toEmail,
        subject: "Solicitud de recuperación de contraseña",
        text: "Recupera tu contraseña",
        html: html,
    };
    try {
        const resMail = await mail_1.default.send(msg);
        return resMail;
    }
    catch (error) {
        throw error;
    }
};
exports.sendMail = sendMail;
const SendEmailWelcomeUser = async (nameUser, toEmail) => {
    const pathHtml = path_1.default.resolve(__dirname, "../../src/views/welcomeUserHtml.ejs");
    if (!fs_1.default.existsSync(pathHtml)) {
        throw new Error(`No se encontró la plantilla en: ${pathHtml}`);
    }
    const linkWelcomeUserHtml = fs_1.default.readFileSync(pathHtml, "utf-8");
    const html = ejs_1.default.render(linkWelcomeUserHtml, {
        urlLogo: process.env.URL_LOGO,
    });
    const msg = {
        from: process.env.FROM_EMAIL || "",
        to: toEmail,
        subject: `Bienvenido ${nameUser}`,
        text: "Te damos la bienvenida a PCinBOX Bajío",
        html: html,
    };
    try {
        const resMail = await mail_1.default.send(msg);
        return resMail;
    }
    catch (error) {
        throw error;
    }
};
exports.SendEmailWelcomeUser = SendEmailWelcomeUser;
//# sourceMappingURL=sendgrid.service.js.map