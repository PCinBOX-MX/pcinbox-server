"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.resFileLinkResetPass = exports.forgotPassword = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const prismaClient_1 = require("../../db/prismaClient");
const index_service_1 = require("./../../services/index.service");
const sendgrid_service_1 = require("./../../services/sendgrid.service");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const date_fns_tz_1 = require("date-fns-tz");
// const envFile = `.env.${process.env.NODE_ENV || "local"}`;
dotenv_1.default.config({ path: ".env.prod" });
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ ok: false, message: "Faltan campos" });
        }
        const slcUser = await prismaClient_1.prisma.users.findFirst({
            where: {
                email: email,
            },
            select: {
                email: true,
                name: true,
                idUser: true,
                password: true,
            },
        });
        if (!slcUser) {
            return res.status(400).json({
                ok: false,
                message: `Cuenta con correo ${email} no encontrado`,
            });
        }
        if (!slcUser.password) {
            return res.status(400).json({
                ok: false,
                message: "Ésta cuenta no tiene contraseña, fue creada con Google",
            });
        }
        //Validar si el usuario a solicitado 3 veces o mas el servicio de reseteo de contrasena
        const currentDate = new Date();
        const twentyFourHoursAgo = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
        // Contar intentos de reseteo en las últimas 24 horas
        const resetAttempts = await prismaClient_1.prisma.resetpassword.findMany({
            where: {
                idUser: slcUser.idUser,
                createdAT: {
                    gte: twentyFourHoursAgo,
                },
            },
        });
        if (resetAttempts.length >= 3) {
            return res.status(400).json({
                ok: false,
                message: `Has superado el límite de 3 intentos de reseteo de contraseña en un periodo de 24 horas. Por favor, espera antes de intentarlo nuevamente.`,
            });
        }
        //Enviar emails
        let gnrResetToken = (0, index_service_1.generateResetToken)();
        const expiryToken = new Date(Date.now() + 1000 * 60 * 60 * 6); //Expira en 6 horas
        const dateExpiryTokenDb = (0, date_fns_tz_1.format)(expiryToken, "yyyy-MM-dd HH:mm:ss", {
            timeZone: "America/Mexico_City",
        });
        const resetLink = `${process.env.SERVER}/api/v1/resetpassword/resFileLinkResetPass?token=${gnrResetToken}&idUser=${slcUser.idUser}`;
        try {
            await (0, sendgrid_service_1.sendMail)(resetLink, slcUser.name, slcUser.email);
        }
        catch (error) {
            (0, index_service_1.writeErrorLogs)(error);
            return res.status(500).json({
                ok: false,
                message: "No se pudo enviar el correo, intentelo de nuevo",
            });
        }
        try {
            await prismaClient_1.prisma.resetpassword.create({
                data: {
                    idUser: slcUser.idUser,
                    expiryToken: dateExpiryTokenDb,
                    refreshToken: gnrResetToken,
                },
            });
            return res.json({
                ok: true,
                message: `Correo de recuperación enviado`,
            });
        }
        catch (error) {
            return res.status(500).json({
                ok: false,
                error: error.message,
                message: "Error interno del servidor",
            });
        }
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message,
            message: "Error interno del servidor",
        });
    }
};
exports.forgotPassword = forgotPassword;
const resFileLinkResetPass = async (req, res) => {
    try {
        const pathHtml = path_1.default.resolve(__dirname, "../../views/resetPasswordHtml.ejs");
        if (!fs_1.default.existsSync(pathHtml)) {
            throw new Error(`No se encontró la plantilla en: ${pathHtml}`);
        }
        return res.render(pathHtml, {
            server: process.env.SERVER || "",
            linkApp: `${process.env.BASE_URL_APP}/principal`,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message,
            message: "Error interno del servidor",
        });
    }
};
exports.resFileLinkResetPass = resFileLinkResetPass;
const changePassword = async (req, res) => {
    try {
        const { newPassword, token, idUser } = req.body;
        const currentDate = new Date();
        if (!token || !idUser || !newPassword) {
            return res.status(400).json({
                ok: false,
                message: "Faltan los campos de token o idUser, intentelo de nuevo",
            });
        }
        let slcUserResetPass = await prismaClient_1.prisma.resetpassword.findFirst({
            where: {
                idUser: Number(idUser),
                refreshToken: String(token),
            },
        });
        if (!slcUserResetPass) {
            return res.status(400).json({
                ok: false,
                message: `Usuario o token no encontrado, intentelo de nuevo`,
            });
        }
        const resetDateToken = new Date(slcUserResetPass.expiryToken);
        if (resetDateToken < currentDate) {
            return res.status(403).json({
                ok: false,
                message: "El token es invalido o ya expiro",
            });
        }
        if (!slcUserResetPass.active) {
            return res.status(403).json({
                ok: false,
                message: "El token ya se usó, intentelo de nuevo",
            });
        }
        const hNewPass = await (0, index_service_1.hasPassword)(newPassword);
        await prismaClient_1.prisma.users.update({
            data: {
                password: hNewPass,
            },
            where: {
                idUser: Number(idUser),
            },
        });
        const tokenRecord = await prismaClient_1.prisma.resetpassword.findFirst({
            where: {
                idUser: Number(idUser),
                refreshToken: token,
            },
        });
        if (!tokenRecord) {
            return res
                .status(404)
                .json({ ok: false, message: "Token no encontrado" });
        }
        await prismaClient_1.prisma.resetpassword.update({
            data: {
                active: false,
            },
            where: {
                idResetPassword: tokenRecord.idResetPassword,
            },
        });
        return res.status(200).json({
            ok: true,
            message: "Contraseña actualizada correctamente",
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message,
            message: "Error interno del servidor",
        });
    }
};
exports.changePassword = changePassword;
//# sourceMappingURL=resetPassword.controller.js.map