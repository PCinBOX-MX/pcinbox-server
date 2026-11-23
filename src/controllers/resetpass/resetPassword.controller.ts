import { Request, Response } from "express";
import { prisma } from "../../db/prismaClient";
import "../../config/loadEnv";
import {
  generateResetToken,
  hasPassword,
  writeErrorLogs,
} from "./../../services/index.service";

import path from "path";
import fs from "fs";
import { fromZonedTime } from "date-fns-tz";
import { dispatchTemplateEmail } from "../../services/mail-dispatch.service";

const RESET_TZ = "America/Mexico_City";
const RESET_MAX_ATTEMPTS_24H = 3;
const RESET_TTL_MS = 1000 * 60 * 60 * 6; // 6 horas

/**
 * expiryToken histórico: wall-clock México "yyyy-MM-dd HH:mm:ss"
 * (si se hace `new Date(str)` en servidor UTC, expira ~6h antes).
 * Nuevos registros: ISO UTC (`toISOString()`).
 */
function parseResetExpiryToken(expiryToken: string): Date {
  const raw = String(expiryToken || "").trim();
  if (!raw) return new Date(0);

  if (raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso;
  }

  const mexicoLocal = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw);
  if (mexicoLocal) {
    return fromZonedTime(raw.replace(" ", "T"), RESET_TZ);
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

type LinkStatus = "ok" | "missing" | "not_found" | "used" | "expired";

type ResolvedReset = {
  status: LinkStatus;
  message: string;
  /** Solo confiable si status === "ok": viene de DB, nunca del cliente. */
  idUser: bigint | null;
  idResetPassword: bigint | null;
};

/**
 * Resuelve el reset SOLO por token (refreshToken).
 * El idUser del cliente / URL se ignora para no permitir hijack.
 */
async function resolveResetByToken(token: string): Promise<ResolvedReset> {
  if (!token) {
    return {
      status: "missing",
      message:
        "El enlace está incompleto o no es válido. Solicita uno nuevo desde «Olvidé mi contraseña».",
      idUser: null,
      idResetPassword: null,
    };
  }

  const row = await prisma.resetpassword.findFirst({
    where: {
      refreshToken: String(token),
    },
    orderBy: { idResetPassword: "desc" },
  });

  if (!row) {
    return {
      status: "not_found",
      message:
        "Este enlace no es válido o no existe. Solicita uno nuevo desde «Olvidé mi contraseña».",
      idUser: null,
      idResetPassword: null,
    };
  }

  if (!row.active) {
    return {
      status: "used",
      message: "Este enlace ya fue utilizado. Solicita uno nuevo.",
      idUser: null,
      idResetPassword: null,
    };
  }

  const expiresAt = parseResetExpiryToken(row.expiryToken);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return {
      status: "expired",
      message: "El enlace expiró. Solicita uno nuevo (válido 6 horas).",
      idUser: null,
      idResetPassword: null,
    };
  }

  return {
    status: "ok",
    message: "",
    idUser: row.idUser,
    idResetPassword: row.idResetPassword,
  };
}

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ ok: false, message: "Faltan campos" });
    }

    const slcUser = await prisma.users.findFirst({
      where: {
        email: email,
      },
      select: {
        email: true,
        name: true,
        idUser: true,
        password: true,
        lastname: true,
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

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const resetAttempts = await prisma.resetpassword.findMany({
      where: {
        idUser: slcUser.idUser,
        createdAT: {
          gte: twentyFourHoursAgo,
        },
      },
    });

    if (resetAttempts.length >= RESET_MAX_ATTEMPTS_24H) {
      return res.status(400).json({
        ok: false,
        message: `Has superado el límite de ${RESET_MAX_ATTEMPTS_24H} intentos de reseteo de contraseña en un periodo de 24 horas. Por favor, espera antes de intentarlo nuevamente.`,
      });
    }

    const gnrResetToken = generateResetToken();
    const expiryToken = new Date(Date.now() + RESET_TTL_MS);
    const dateExpiryTokenDb = expiryToken.toISOString();

    // Solo el token identifica el reset; idUser en URL es opcional/legacy.
    const resetLink = `${process.env.SERVER}/api/v1/resetpassword/resFileLinkResetPass?token=${encodeURIComponent(gnrResetToken)}`;

    try {
      await dispatchTemplateEmail(
        slcUser.email,
        "Recuperar contraseña",
        "password-reset",
        {
          RESETLINK: resetLink,
          USERNAME: `${slcUser.name} ${slcUser.lastname || ""}`,
        },
      );
    } catch (error) {
      writeErrorLogs(error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo enviar el correo, intentelo de nuevo",
      });
    }

    try {
      await prisma.resetpassword.create({
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
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        error: error.message,
        message: "Error interno del servidor",
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

export const resFileLinkResetPass = async (req: Request, res: Response) => {
  try {
    const pathHtml = path.resolve(
      __dirname,
      "../../views/resetPasswordHtml.ejs",
    );

    if (!fs.existsSync(pathHtml)) {
      throw new Error(`No se encontró la plantilla en: ${pathHtml}`);
    }

    const token = String(req.query.token || "").trim();
    const resolved = await resolveResetByToken(token);
    const canReset = resolved.status === "ok";

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");

    return res.render(pathHtml, {
      server: process.env.SERVER || "",
      linkApp: `${process.env.BASE_URL_APP || process.env.CLIENT_URL || ""}/principal`,
      token: canReset ? token : "",
      linkStatus: resolved.status,
      linkMessage: resolved.message,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { newPassword, token } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        ok: false,
        message: "Faltan el token o la nueva contraseña. Inténtalo de nuevo.",
      });
    }

    if (String(newPassword).trim().length < 8) {
      return res.status(400).json({
        ok: false,
        message: "La contraseña debe tener al menos 8 caracteres.",
      });
    }

    const resolved = await resolveResetByToken(String(token));
    if (resolved.status !== "ok" || resolved.idUser == null || resolved.idResetPassword == null) {
      const statusCode =
        resolved.status === "expired" || resolved.status === "used" ? 403 : 400;
      return res.status(statusCode).json({
        ok: false,
        message: resolved.message,
      });
    }

    // idUser SIEMPRE desde la fila del token en DB — nunca del body/URL
    const ownerId = Number(resolved.idUser);

    const hNewPass = await hasPassword(newPassword);

    await prisma.users.update({
      data: {
        password: hNewPass,
      },
      where: {
        idUser: ownerId,
      },
    });

    await prisma.resetpassword.update({
      data: {
        active: false,
      },
      where: {
        idResetPassword: resolved.idResetPassword,
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor",
    });
  }
};
