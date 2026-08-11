import crypto from "crypto";
import { DateTime } from "luxon";
import { prisma } from "../db/prismaClient";
import {
  hasPassword,
  verifyPassword,
  writeErrorLogs,
} from "./index.service";
import { sendEmailResend } from "./resend.service";

export const REGISTER_CODE_TTL_MINUTES = 15;
export const REGISTER_MAX_RESENDS = 3;
export const REGISTER_RESEND_COOLDOWN_SECONDS = 60;
export const REGISTER_MAX_VERIFY_ATTEMPTS = 5;
export const REGISTER_VERIFY_TEMPLATE_ID = "verification-code";

function normalizeEmail(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function generateNumericCode(length = 6): string {
  const max = 10 ** length;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(length, "0");
}

function buildExpiryDate(): Date {
  return DateTime.now()
    .setZone("America/Mexico_City")
    .plus({ minutes: REGISTER_CODE_TTL_MINUTES })
    .toJSDate();
}

async function sendVerificationEmail(params: {
  email: string;
  name: string;
  lastname: string;
  code: string;
}) {
  const result = await sendEmailResend(
    params.email,
    "Código de verificación — PCinBOX",
    REGISTER_VERIFY_TEMPLATE_ID,
    {
      NAME: `${params.name} ${params.lastname}`.trim(),
      EMAIL: params.email,
      CODE: params.code,
      EXPIRES_MINUTES: String(REGISTER_CODE_TTL_MINUTES),
    },
  );

  if (result?.status === 400) {
    throw new Error(
      result.error ||
        `No se pudo enviar el correo (plantilla "${REGISTER_VERIFY_TEMPLATE_ID}")`,
    );
  }
}

export type RegisterDraftInput = {
  name: string;
  lastname: string;
  email: string;
  phone: string;
  password: string;
};

export async function requestRegisterVerificationCode(
  input: RegisterDraftInput,
) {
  const name = String(input.name || "").trim();
  const lastname = String(input.lastname || "").trim();
  const email = normalizeEmail(input.email);
  const phone = String(input.phone || "").trim();
  const password = String(input.password || "");

  if (!name || !lastname || !email || !phone || !password) {
    return {
      ok: false as const,
      status: 400,
      message: "Completa los campos",
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      ok: false as const,
      status: 400,
      message: `El correo ${email} no tiene el formato correcto`,
    };
  }

  if (password.length < 6) {
    return {
      ok: false as const,
      status: 400,
      message: "La contraseña debe tener al menos 6 caracteres",
    };
  }

  const existingUser = await prisma.users.findFirst({
    where: { email },
    select: { email: true },
  });

  if (existingUser) {
    return {
      ok: false as const,
      status: 400,
      message: `El correo ${email} ya está registrado o se desvinculó del sistema`,
    };
  }

  const since = DateTime.now()
    .setZone("America/Mexico_City")
    .minus({ hours: 24 })
    .toJSDate();

  const recentRows = await prisma.register_email_codes.findMany({
    where: {
      email,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });

  // 1 envío inicial + hasta REGISTER_MAX_RESENDS reenvíos en 24h.
  const emailsSentEstimate = recentRows.reduce(
    (sum, row) => sum + 1 + Number(row.resendCount || 0),
    0,
  );

  if (emailsSentEstimate >= REGISTER_MAX_RESENDS + 1) {
    return {
      ok: false as const,
      status: 400,
      message: `Has superado el límite de ${REGISTER_MAX_RESENDS + 1} envíos de código en 24 horas. Intenta más tarde.`,
      data: {
        resendsRemaining: 0,
        maxResends: REGISTER_MAX_RESENDS,
      },
    };
  }

  const activePending = await prisma.register_email_codes.findFirst({
    where: {
      email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (activePending?.lastResendAt) {
    const elapsedSec =
      (Date.now() - new Date(activePending.lastResendAt).getTime()) / 1000;
    if (elapsedSec < REGISTER_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(REGISTER_RESEND_COOLDOWN_SECONDS - elapsedSec);
      return {
        ok: false as const,
        status: 429,
        message: `Espera ${wait} segundos antes de solicitar otro código.`,
        data: { retryAfterSeconds: wait },
      };
    }
  }

  const code = generateNumericCode(6);
  const codeHash = await hasPassword(code);
  const passwordHash = await hasPassword(password);
  const expiresAt = buildExpiryDate();
  const now = DateTime.now().setZone("America/Mexico_City").toJSDate();

  // Invalidar pendientes previos del mismo correo
  await prisma.register_email_codes.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: now },
  });

  await prisma.register_email_codes.create({
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
  } catch (error: any) {
    writeErrorLogs(error);
    const detail = String(error?.message || "").trim();
    return {
      ok: false as const,
      status: 500,
      message: detail
        ? `No se pudo enviar el correo de verificación: ${detail}`
        : "No se pudo enviar el correo de verificación. Intenta de nuevo.",
    };
  }

  const resendsRemaining = Math.max(
    0,
    REGISTER_MAX_RESENDS - 0, // nuevo registro: aún puede reenviar MAX veces
  );

  return {
    ok: true as const,
    status: 200,
    message: `Enviamos un código de verificación a ${email}`,
    data: {
      email,
      expiresInMinutes: REGISTER_CODE_TTL_MINUTES,
      resendsRemaining,
      maxResends: REGISTER_MAX_RESENDS,
      cooldownSeconds: REGISTER_RESEND_COOLDOWN_SECONDS,
    },
  };
}

export async function resendRegisterVerificationCode(emailRaw: string) {
  const email = normalizeEmail(emailRaw);
  if (!email) {
    return {
      ok: false as const,
      status: 400,
      message: "Falta el correo",
    };
  }

  const pending = await prisma.register_email_codes.findFirst({
    where: {
      email,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!pending) {
    return {
      ok: false as const,
      status: 400,
      message:
        "No hay un registro pendiente para este correo. Vuelve a llenar el formulario.",
    };
  }

  if (Number(pending.resendCount) >= REGISTER_MAX_RESENDS) {
    return {
      ok: false as const,
      status: 400,
      message: `Has alcanzado el máximo de ${REGISTER_MAX_RESENDS} reenvíos. Solicita un nuevo registro más tarde.`,
      data: { resendsRemaining: 0 },
    };
  }

  if (pending.lastResendAt) {
    const elapsedSec =
      (Date.now() - new Date(pending.lastResendAt).getTime()) / 1000;
    if (elapsedSec < REGISTER_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(REGISTER_RESEND_COOLDOWN_SECONDS - elapsedSec);
      return {
        ok: false as const,
        status: 429,
        message: `Espera ${wait} segundos antes de reenviar el código.`,
        data: { retryAfterSeconds: wait },
      };
    }
  }

  const code = generateNumericCode(6);
  const codeHash = await hasPassword(code);
  const expiresAt = buildExpiryDate();
  const now = DateTime.now().setZone("America/Mexico_City").toJSDate();

  await prisma.register_email_codes.update({
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
  } catch (error: any) {
    writeErrorLogs(error);
    const detail = String(error?.message || "").trim();
    return {
      ok: false as const,
      status: 500,
      message: detail
        ? `No se pudo reenviar el correo: ${detail}`
        : "No se pudo reenviar el correo. Intenta de nuevo.",
    };
  }

  const resendsRemaining = Math.max(
    0,
    REGISTER_MAX_RESENDS - (Number(pending.resendCount) + 1),
  );

  return {
    ok: true as const,
    status: 200,
    message: `Código reenviado a ${email}`,
    data: {
      email,
      expiresInMinutes: REGISTER_CODE_TTL_MINUTES,
      resendsRemaining,
      maxResends: REGISTER_MAX_RESENDS,
      cooldownSeconds: REGISTER_RESEND_COOLDOWN_SECONDS,
    },
  };
}

export async function confirmRegisterVerificationCode(params: {
  email: string;
  code: string;
}) {
  const email = normalizeEmail(params.email);
  const code = String(params.code || "")
    .trim()
    .replace(/\s+/g, "");

  if (!email || !code) {
    return {
      ok: false as const,
      status: 400,
      message: "Faltan el correo o el código",
    };
  }

  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false as const,
      status: 400,
      message: "El código debe ser de 6 dígitos",
    };
  }

  const pending = await prisma.register_email_codes.findFirst({
    where: {
      email,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!pending) {
    return {
      ok: false as const,
      status: 400,
      message:
        "No hay un registro pendiente. Vuelve a completar el formulario de registro.",
    };
  }

  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    return {
      ok: false as const,
      status: 400,
      message: "El código expiró. Solicita uno nuevo desde el registro.",
    };
  }

  if (Number(pending.verifyAttempts) >= REGISTER_MAX_VERIFY_ATTEMPTS) {
    await prisma.register_email_codes.update({
      where: { id: pending.id },
      data: {
        consumedAt: DateTime.now().setZone("America/Mexico_City").toJSDate(),
      },
    });
    return {
      ok: false as const,
      status: 400,
      message:
        "Demasiados intentos fallidos. Solicita un nuevo código desde el registro.",
    };
  }

  const valid = await verifyPassword(code, pending.codeHash);
  if (!valid) {
    await prisma.register_email_codes.update({
      where: { id: pending.id },
      data: { verifyAttempts: Number(pending.verifyAttempts) + 1 },
    });
    const left =
      REGISTER_MAX_VERIFY_ATTEMPTS - (Number(pending.verifyAttempts) + 1);
    return {
      ok: false as const,
      status: 400,
      message:
        left > 0
          ? `Código incorrecto. Te quedan ${left} intento(s).`
          : "Código incorrecto. Solicita un nuevo código desde el registro.",
    };
  }

  const existingUser = await prisma.users.findFirst({
    where: { email },
    select: { email: true },
  });

  if (existingUser) {
    await prisma.register_email_codes.update({
      where: { id: pending.id },
      data: {
        consumedAt: DateTime.now().setZone("America/Mexico_City").toJSDate(),
      },
    });
    return {
      ok: false as const,
      status: 400,
      message: `El correo ${email} ya está registrado`,
    };
  }

  const fechaLocal = DateTime.now().setZone("America/Mexico_City");

  await prisma.users.create({
    data: {
      name: pending.name,
      lastname: pending.lastname,
      email,
      password: pending.passwordHash,
      phone: pending.phone,
      role: "customer",
      createdAT: fechaLocal.toISO(),
    },
  });

  await prisma.register_email_codes.update({
    where: { id: pending.id },
    data: { consumedAt: fechaLocal.toJSDate() },
  });

  try {
    await sendEmailResend(email, "Bienvenido a PCinBOX", "welcome-email-1", {
      NAME: `${pending.name} ${pending.lastname}`,
    });
  } catch (error) {
    writeErrorLogs(error);
  }

  return {
    ok: true as const,
    status: 200,
    message: "Cuenta creada correctamente",
    data: { email },
  };
}
