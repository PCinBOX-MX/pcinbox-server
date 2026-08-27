"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTER_VERIFY_TEMPLATE_ID = exports.REGISTER_MAX_VERIFY_ATTEMPTS = exports.REGISTER_RESEND_COOLDOWN_SECONDS = exports.REGISTER_MAX_RESENDS = exports.REGISTER_CODE_TTL_MINUTES = void 0;
exports.requestRegisterVerificationCode = requestRegisterVerificationCode;
exports.resendRegisterVerificationCode = resendRegisterVerificationCode;
exports.confirmRegisterVerificationCode = confirmRegisterVerificationCode;
const crypto_1 = __importDefault(require("crypto"));
const luxon_1 = require("luxon");
const prismaClient_1 = require("../db/prismaClient");
const index_service_1 = require("./index.service");
const resend_service_1 = require("./resend.service");
exports.REGISTER_CODE_TTL_MINUTES = 15;
exports.REGISTER_MAX_RESENDS = 3;
exports.REGISTER_RESEND_COOLDOWN_SECONDS = 60;
exports.REGISTER_MAX_VERIFY_ATTEMPTS = 5;
exports.REGISTER_VERIFY_TEMPLATE_ID = "verification-code";
function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}
function generateNumericCode(length = 6) {
    const max = 10 ** length;
    const num = crypto_1.default.randomInt(0, max);
    return String(num).padStart(length, "0");
}
function buildExpiryDate() {
    return luxon_1.DateTime.now()
        .setZone("America/Mexico_City")
        .plus({ minutes: exports.REGISTER_CODE_TTL_MINUTES })
        .toJSDate();
}
async function sendVerificationEmail(params) {
    const result = await (0, resend_service_1.sendEmailResend)(params.email, "Código de verificación — PCinBOX", exports.REGISTER_VERIFY_TEMPLATE_ID, {
        NAME: `${params.name} ${params.lastname}`.trim(),
        EMAIL: params.email,
        CODE: params.code,
        EXPIRES_MINUTES: String(exports.REGISTER_CODE_TTL_MINUTES),
    });
    if (result?.status === 400) {
        throw new Error(result.error ||
            `No se pudo enviar el correo (plantilla "${exports.REGISTER_VERIFY_TEMPLATE_ID}")`);
    }
}
async function requestRegisterVerificationCode(input) {
    const name = String(input.name || "").trim();
    const lastname = String(input.lastname || "").trim();
    const email = normalizeEmail(input.email);
    const phone = String(input.phone || "").trim();
    const password = String(input.password || "");
    if (!name || !lastname || !email || !phone || !password) {
        return {
            ok: false,
            status: 400,
            message: "Completa los campos",
        };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            ok: false,
            status: 400,
            message: `El correo ${email} no tiene el formato correcto`,
        };
    }
    if (password.length < 6) {
        return {
            ok: false,
            status: 400,
            message: "La contraseña debe tener al menos 6 caracteres",
        };
    }
    const existingUser = await prismaClient_1.prisma.users.findFirst({
        where: { email },
        select: { email: true },
    });
    if (existingUser) {
        return {
            ok: false,
            status: 400,
            message: `El correo ${email} ya está registrado o se desvinculó del sistema`,
        };
    }
    const since = luxon_1.DateTime.now()
        .setZone("America/Mexico_City")
        .minus({ hours: 24 })
        .toJSDate();
    const recentRows = await prismaClient_1.prisma.register_email_codes.findMany({
        where: {
            email,
            createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
    });
    // 1 envío inicial + hasta REGISTER_MAX_RESENDS reenvíos en 24h.
    const emailsSentEstimate = recentRows.reduce((sum, row) => sum + 1 + Number(row.resendCount || 0), 0);
    if (emailsSentEstimate >= exports.REGISTER_MAX_RESENDS + 1) {
        return {
            ok: false,
            status: 400,
            message: `Has superado el límite de ${exports.REGISTER_MAX_RESENDS + 1} envíos de código en 24 horas. Intenta más tarde.`,
            data: {
                resendsRemaining: 0,
                maxResends: exports.REGISTER_MAX_RESENDS,
            },
        };
    }
    const activePending = await prismaClient_1.prisma.register_email_codes.findFirst({
        where: {
            email,
            consumedAt: null,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
    });
    if (activePending?.lastResendAt) {
        const elapsedSec = (Date.now() - new Date(activePending.lastResendAt).getTime()) / 1000;
        if (elapsedSec < exports.REGISTER_RESEND_COOLDOWN_SECONDS) {
            const wait = Math.ceil(exports.REGISTER_RESEND_COOLDOWN_SECONDS - elapsedSec);
            return {
                ok: false,
                status: 429,
                message: `Espera ${wait} segundos antes de solicitar otro código.`,
                data: { retryAfterSeconds: wait },
            };
        }
    }
    const code = generateNumericCode(6);
    const codeHash = await (0, index_service_1.hasPassword)(code);
    const passwordHash = await (0, index_service_1.hasPassword)(password);
    const expiresAt = buildExpiryDate();
    const now = luxon_1.DateTime.now().setZone("America/Mexico_City").toJSDate();
    // Invalidar pendientes previos del mismo correo
    await prismaClient_1.prisma.register_email_codes.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: now },
    });
    await prismaClient_1.prisma.register_email_codes.create({
        data: {
            email,
            codeHash,
            name,
            lastname,
            phone,
            passwordHash,
            resendCount: 0,
            verifyAttempts: 0,
            lastResendAt: now,
            expiresAt,
        },
    });
    try {
        await sendVerificationEmail({ email, name, lastname, code });
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(error);
        const detail = String(error?.message || "").trim();
        return {
            ok: false,
            status: 500,
            message: detail
                ? `No se pudo enviar el correo de verificación: ${detail}`
                : "No se pudo enviar el correo de verificación. Intenta de nuevo.",
        };
    }
    const resendsRemaining = Math.max(0, exports.REGISTER_MAX_RESENDS - 0);
    return {
        ok: true,
        status: 200,
        message: `Enviamos un código de verificación a ${email}`,
        data: {
            email,
            expiresInMinutes: exports.REGISTER_CODE_TTL_MINUTES,
            resendsRemaining,
            maxResends: exports.REGISTER_MAX_RESENDS,
            cooldownSeconds: exports.REGISTER_RESEND_COOLDOWN_SECONDS,
        },
    };
}
async function resendRegisterVerificationCode(emailRaw) {
    const email = normalizeEmail(emailRaw);
    if (!email) {
        return {
            ok: false,
            status: 400,
            message: "Falta el correo",
        };
    }
    const pending = await prismaClient_1.prisma.register_email_codes.findFirst({
        where: {
            email,
            consumedAt: null,
        },
        orderBy: { createdAt: "desc" },
    });
    if (!pending) {
        return {
            ok: false,
            status: 400,
            message: "No hay un registro pendiente para este correo. Vuelve a llenar el formulario.",
        };
    }
    if (Number(pending.resendCount) >= exports.REGISTER_MAX_RESENDS) {
        return {
            ok: false,
            status: 400,
            message: `Has alcanzado el máximo de ${exports.REGISTER_MAX_RESENDS} reenvíos. Solicita un nuevo registro más tarde.`,
            data: { resendsRemaining: 0 },
        };
    }
    if (pending.lastResendAt) {
        const elapsedSec = (Date.now() - new Date(pending.lastResendAt).getTime()) / 1000;
        if (elapsedSec < exports.REGISTER_RESEND_COOLDOWN_SECONDS) {
            const wait = Math.ceil(exports.REGISTER_RESEND_COOLDOWN_SECONDS - elapsedSec);
            return {
                ok: false,
                status: 429,
                message: `Espera ${wait} segundos antes de reenviar el código.`,
                data: { retryAfterSeconds: wait },
            };
        }
    }
    const code = generateNumericCode(6);
    const codeHash = await (0, index_service_1.hasPassword)(code);
    const expiresAt = buildExpiryDate();
    const now = luxon_1.DateTime.now().setZone("America/Mexico_City").toJSDate();
    await prismaClient_1.prisma.register_email_codes.update({
        where: { id: pending.id },
        data: {
            codeHash,
            expiresAt,
            lastResendAt: now,
            resendCount: Number(pending.resendCount) + 1,
            verifyAttempts: 0,
        },
    });
    try {
        await sendVerificationEmail({
            email,
            name: pending.name,
            lastname: pending.lastname,
            code,
        });
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(error);
        const detail = String(error?.message || "").trim();
        return {
            ok: false,
            status: 500,
            message: detail
                ? `No se pudo reenviar el correo: ${detail}`
                : "No se pudo reenviar el correo. Intenta de nuevo.",
        };
    }
    const resendsRemaining = Math.max(0, exports.REGISTER_MAX_RESENDS - (Number(pending.resendCount) + 1));
    return {
        ok: true,
        status: 200,
        message: `Código reenviado a ${email}`,
        data: {
            email,
            expiresInMinutes: exports.REGISTER_CODE_TTL_MINUTES,
            resendsRemaining,
            maxResends: exports.REGISTER_MAX_RESENDS,
            cooldownSeconds: exports.REGISTER_RESEND_COOLDOWN_SECONDS,
        },
    };
}
async function confirmRegisterVerificationCode(params) {
    const email = normalizeEmail(params.email);
    const code = String(params.code || "")
        .trim()
        .replace(/\s+/g, "");
    if (!email || !code) {
        return {
            ok: false,
            status: 400,
            message: "Faltan el correo o el código",
        };
    }
    if (!/^\d{6}$/.test(code)) {
        return {
            ok: false,
            status: 400,
            message: "El código debe ser de 6 dígitos",
        };
    }
    const pending = await prismaClient_1.prisma.register_email_codes.findFirst({
        where: {
            email,
            consumedAt: null,
        },
        orderBy: { createdAt: "desc" },
    });
    if (!pending) {
        return {
            ok: false,
            status: 400,
            message: "No hay un registro pendiente. Vuelve a completar el formulario de registro.",
        };
    }
    if (new Date(pending.expiresAt).getTime() < Date.now()) {
        return {
            ok: false,
            status: 400,
            message: "El código expiró. Solicita uno nuevo desde el registro.",
        };
    }
    if (Number(pending.verifyAttempts) >= exports.REGISTER_MAX_VERIFY_ATTEMPTS) {
        await prismaClient_1.prisma.register_email_codes.update({
            where: { id: pending.id },
            data: {
                consumedAt: luxon_1.DateTime.now().setZone("America/Mexico_City").toJSDate(),
            },
        });
        return {
            ok: false,
            status: 400,
            message: "Demasiados intentos fallidos. Solicita un nuevo código desde el registro.",
        };
    }
    const valid = await (0, index_service_1.verifyPassword)(code, pending.codeHash);
    if (!valid) {
        await prismaClient_1.prisma.register_email_codes.update({
            where: { id: pending.id },
            data: { verifyAttempts: Number(pending.verifyAttempts) + 1 },
        });
        const left = exports.REGISTER_MAX_VERIFY_ATTEMPTS - (Number(pending.verifyAttempts) + 1);
        return {
            ok: false,
            status: 400,
            message: left > 0
                ? `Código incorrecto. Te quedan ${left} intento(s).`
                : "Código incorrecto. Solicita un nuevo código desde el registro.",
        };
    }
    const existingUser = await prismaClient_1.prisma.users.findFirst({
        where: { email },
        select: { email: true },
    });
    if (existingUser) {
        await prismaClient_1.prisma.register_email_codes.update({
            where: { id: pending.id },
            data: {
                consumedAt: luxon_1.DateTime.now().setZone("America/Mexico_City").toJSDate(),
            },
        });
        return {
            ok: false,
            status: 400,
            message: `El correo ${email} ya está registrado`,
        };
    }
    const fechaLocal = luxon_1.DateTime.now().setZone("America/Mexico_City");
    const createdUser = await prismaClient_1.prisma.users.create({
        data: {
            name: pending.name,
            lastname: pending.lastname,
            email,
            password: pending.passwordHash,
            phone: pending.phone,
            role: "customer",
            createdAT: fechaLocal.toISO(),
        },
        select: {
            idUser: true,
            email: true,
            name: true,
            lastname: true,
            role: true,
        },
    });
    await prismaClient_1.prisma.register_email_codes.update({
        where: { id: pending.id },
        data: { consumedAt: fechaLocal.toJSDate() },
    });
    try {
        await (0, resend_service_1.sendEmailResend)(email, "Bienvenido a PCinBOX", "welcome-email-1", {
            NAME: `${pending.name} ${pending.lastname}`,
        });
    }
    catch (error) {
        (0, index_service_1.writeErrorLogs)(error);
    }
    const token = (0, index_service_1.signPayload)({
        email: createdUser.email,
        idUser: createdUser.idUser.toString(),
        rol: createdUser.role,
    }, "3d");
    return {
        ok: true,
        status: 200,
        message: "Cuenta creada correctamente. Sesión iniciada.",
        data: {
            email: createdUser.email,
            token,
            idUser: createdUser.idUser.toString(),
            name: createdUser.name,
            lastname: createdUser.lastname,
            role: createdUser.role,
            totalFavorites: 0,
        },
    };
}
//# sourceMappingURL=registerEmailVerification.service.js.map