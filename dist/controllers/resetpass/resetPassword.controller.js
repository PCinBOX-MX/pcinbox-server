"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/controllers/resetpass/resetPassword.controller.ts
var resetPassword_controller_exports = {};
__export(resetPassword_controller_exports, {
  changePassword: () => changePassword,
  forgotPassword: () => forgotPassword,
  resFileLinkResetPass: () => resFileLinkResetPass
});
module.exports = __toCommonJS(resetPassword_controller_exports);

// src/db/prismaClient.ts
var import_client = require("@prisma/client");
var globalForPrisma = global;
var prisma = globalForPrisma.prisma || new import_client.PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// src/config/loadEnv.ts
var import_dotenv = __toESM(require("dotenv"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var cwd = process.cwd();
function loadEnvFile(fileName) {
  const filePath = import_path.default.resolve(cwd, fileName);
  if (!import_fs.default.existsSync(filePath)) return;
  import_dotenv.default.config({
    path: filePath,
    override: false
  });
}
loadEnvFile(".env.local");
loadEnvFile(".env.prod");

// src/services/index.service.ts
var import_bcrypt = __toESM(require("bcrypt"));
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var import_nanoid = require("nanoid");
var import_fs2 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var import_axios = __toESM(require("axios"));
var import_xlsx = __toESM(require("xlsx"));
var hasPassword = async (password) => {
  const saltRounds = 10;
  const hashedPassword = await import_bcrypt.default.hash(password, saltRounds);
  return hashedPassword;
};
function generateResetToken() {
  return (0, import_nanoid.nanoid)(100);
}
var writeErrorLogs = (error) => {
  const currentDate = (/* @__PURE__ */ new Date()).toLocaleString();
  const fileLogs = import_path2.default.join(__dirname, "logs.txt");
  const logEntry = `[${currentDate}] ${error}
`;
  import_fs2.default.appendFile(fileLogs, logEntry, (err) => {
    if (err) {
      console.error("Error al escribir en el archivo de log:", err);
    }
  });
};
var formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

// src/controllers/resetpass/resetPassword.controller.ts
var import_path3 = __toESM(require("path"));
var import_fs3 = __toESM(require("fs"));
var import_date_fns_tz = require("date-fns-tz");

// src/services/resend.service.ts
var import_resend = require("resend");
function getResendClient() {
  const key = process.env.RESEND_KEY?.trim() || "";
  return new import_resend.Resend(key);
}
function normalizeTemplateVariables(variables) {
  const normalized = {};
  for (const [key, value] of Object.entries(variables || {})) {
    normalized[key] = typeof value === "number" ? String(value) : value;
  }
  return normalized;
}
var sendEmailResend = async (to, subject, idTemplate, variables) => {
  try {
    if (!process.env.RESEND_KEY?.trim()) {
      return {
        status: 400,
        error: "RESEND_KEY no est\xE1 configurada en el servidor"
      };
    }
    if (!process.env.FROM_EMAIL?.trim()) {
      return {
        status: 400,
        error: "FROM_EMAIL no est\xE1 configurada en el servidor"
      };
    }
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "",
      to: typeof to === "string" ? [to] : to,
      subject,
      template: {
        id: idTemplate,
        variables: normalizeTemplateVariables(variables)
      }
    });
    if (error) {
      console.error("[sendEmailResend] Resend error:", {
        template: idTemplate,
        message: error?.message,
        error
      });
      return {
        status: 400,
        error: error?.message
      };
    }
  } catch (error) {
    console.error("[sendEmailResend] exception:", error?.message || error);
    return {
      status: 400,
      error: error?.message
    };
  }
};

// src/controllers/resetpass/resetPassword.controller.ts
var RESET_TZ = "America/Mexico_City";
var RESET_MAX_ATTEMPTS_24H = 3;
var RESET_TTL_MS = 1e3 * 60 * 60 * 6;
function parseResetExpiryToken(expiryToken) {
  const raw = String(expiryToken || "").trim();
  if (!raw) return /* @__PURE__ */ new Date(0);
  if (raw.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  const mexicoLocal = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw);
  if (mexicoLocal) {
    return (0, import_date_fns_tz.fromZonedTime)(raw.replace(" ", "T"), RESET_TZ);
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? /* @__PURE__ */ new Date(0) : fallback;
}
async function resolveResetByToken(token) {
  if (!token) {
    return {
      status: "missing",
      message: "El enlace est\xE1 incompleto o no es v\xE1lido. Solicita uno nuevo desde \xABOlvid\xE9 mi contrase\xF1a\xBB.",
      idUser: null,
      idResetPassword: null
    };
  }
  const row = await prisma.resetpassword.findFirst({
    where: {
      refreshToken: String(token)
    },
    orderBy: { idResetPassword: "desc" }
  });
  if (!row) {
    return {
      status: "not_found",
      message: "Este enlace no es v\xE1lido o no existe. Solicita uno nuevo desde \xABOlvid\xE9 mi contrase\xF1a\xBB.",
      idUser: null,
      idResetPassword: null
    };
  }
  if (!row.active) {
    return {
      status: "used",
      message: "Este enlace ya fue utilizado. Solicita uno nuevo.",
      idUser: null,
      idResetPassword: null
    };
  }
  const expiresAt = parseResetExpiryToken(row.expiryToken);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return {
      status: "expired",
      message: "El enlace expir\xF3. Solicita uno nuevo (v\xE1lido 6 horas).",
      idUser: null,
      idResetPassword: null
    };
  }
  return {
    status: "ok",
    message: "",
    idUser: row.idUser,
    idResetPassword: row.idResetPassword
  };
}
var forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ ok: false, message: "Faltan campos" });
    }
    const slcUser = await prisma.users.findFirst({
      where: {
        email
      },
      select: {
        email: true,
        name: true,
        idUser: true,
        password: true,
        lastname: true
      }
    });
    if (!slcUser) {
      return res.status(400).json({
        ok: false,
        message: `Cuenta con correo ${email} no encontrado`
      });
    }
    if (!slcUser.password) {
      return res.status(400).json({
        ok: false,
        message: "\xC9sta cuenta no tiene contrase\xF1a, fue creada con Google"
      });
    }
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const resetAttempts = await prisma.resetpassword.findMany({
      where: {
        idUser: slcUser.idUser,
        createdAT: {
          gte: twentyFourHoursAgo
        }
      }
    });
    if (resetAttempts.length >= RESET_MAX_ATTEMPTS_24H) {
      return res.status(400).json({
        ok: false,
        message: `Has superado el l\xEDmite de ${RESET_MAX_ATTEMPTS_24H} intentos de reseteo de contrase\xF1a en un periodo de 24 horas. Por favor, espera antes de intentarlo nuevamente.`
      });
    }
    const gnrResetToken = generateResetToken();
    const expiryToken = new Date(Date.now() + RESET_TTL_MS);
    const dateExpiryTokenDb = expiryToken.toISOString();
    const resetLink = `${process.env.SERVER}/api/v1/resetpassword/resFileLinkResetPass?token=${encodeURIComponent(gnrResetToken)}`;
    try {
      await sendEmailResend(
        slcUser.email,
        "Recuperar contrase\xF1a",
        "password-reset",
        {
          RESETLINK: resetLink,
          USERNAME: `${slcUser.name} ${slcUser.lastname || ""}`
        }
      );
    } catch (error) {
      writeErrorLogs(error);
      return res.status(500).json({
        ok: false,
        message: "No se pudo enviar el correo, intentelo de nuevo"
      });
    }
    try {
      await prisma.resetpassword.create({
        data: {
          idUser: slcUser.idUser,
          expiryToken: dateExpiryTokenDb,
          refreshToken: gnrResetToken
        }
      });
      return res.json({
        ok: true,
        message: `Correo de recuperaci\xF3n enviado`
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message,
        message: "Error interno del servidor"
      });
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor"
    });
  }
};
var resFileLinkResetPass = async (req, res) => {
  try {
    const pathHtml = import_path3.default.resolve(
      __dirname,
      "../../views/resetPasswordHtml.ejs"
    );
    if (!import_fs3.default.existsSync(pathHtml)) {
      throw new Error(`No se encontr\xF3 la plantilla en: ${pathHtml}`);
    }
    const token = String(req.query.token || "").trim();
    const resolved = await resolveResetByToken(token);
    const canReset = resolved.status === "ok";
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.render(pathHtml, {
      server: process.env.SERVER || "",
      linkApp: `${process.env.BASE_URL_APP || process.env.CLIENT_URL || ""}/principal`,
      token: canReset ? token : "",
      linkStatus: resolved.status,
      linkMessage: resolved.message
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor"
    });
  }
};
var changePassword = async (req, res) => {
  try {
    const { newPassword, token } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({
        ok: false,
        message: "Faltan el token o la nueva contrase\xF1a. Int\xE9ntalo de nuevo."
      });
    }
    if (String(newPassword).trim().length < 8) {
      return res.status(400).json({
        ok: false,
        message: "La contrase\xF1a debe tener al menos 8 caracteres."
      });
    }
    const resolved = await resolveResetByToken(String(token));
    if (resolved.status !== "ok" || resolved.idUser == null || resolved.idResetPassword == null) {
      const statusCode = resolved.status === "expired" || resolved.status === "used" ? 403 : 400;
      return res.status(statusCode).json({
        ok: false,
        message: resolved.message
      });
    }
    const ownerId = Number(resolved.idUser);
    const hNewPass = await hasPassword(newPassword);
    await prisma.users.update({
      data: {
        password: hNewPass
      },
      where: {
        idUser: ownerId
      }
    });
    await prisma.resetpassword.update({
      data: {
        active: false
      },
      where: {
        idResetPassword: resolved.idResetPassword
      }
    });
    return res.status(200).json({
      ok: true,
      message: "Contrase\xF1a actualizada correctamente"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      message: "Error interno del servidor"
    });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  changePassword,
  forgotPassword,
  resFileLinkResetPass
});
