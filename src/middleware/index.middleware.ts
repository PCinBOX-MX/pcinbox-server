import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import "../config/loadEnv";
import CustomRequestI from "../interfaces/customrequest.interface";
import { prisma } from "./../db/prismaClient";
import { extractAuthToken } from "../utils/authCookie.util";

async function resolveIdUserFromToken(
  token: string,
): Promise<number | string | null> {
  const secret = process.env.KEY_JWT || "";
  const decoded: any = jwt.verify(token, secret);

  if (!decoded) return null;

  if (!decoded.idUser) {
    const slcUser = await prisma.users.findFirst({
      where: {
        email: decoded.email,
      },
      select: {
        idUser: true,
      },
    });
    return slcUser?.idUser ?? null;
  }

  return decoded.idUser;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CLIENT_HEADER = "x-pcinbox-client";

function hasBearerHeader(req: CustomRequestI): boolean {
  const auth = req.headers.authorization;
  return Boolean(auth && auth.startsWith("Bearer ") && auth.length > 8);
}

/**
 * Cookie httpOnly + SameSite=None: exige cabecera custom en mutaciones
 * autenticadas solo por cookie (mitiga CSRF de formularios cross-site).
 * Bearer sigue siendo suficiente (no se envía automáticamente en CSRF clásico).
 */
function rejectCookieOnlyCsrf(req: CustomRequestI, res: Response): boolean {
  const method = String(req.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return false;
  if (hasBearerHeader(req)) return false;
  const marker = String(req.headers[CLIENT_HEADER] || "").trim();
  if (marker === "1") return false;
  res.status(403).json({
    ok: false,
    message: "Solicitud rechazada (falta cabecera anti-CSRF).",
  });
  return true;
}

export const MiddleAuthRoute = async (
  req: CustomRequestI,
  res: Response,
  next: NextFunction,
) => {
  const token = extractAuthToken(req);

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  if (rejectCookieOnlyCsrf(req, res)) {
    return;
  }

  try {
    const idUser = await resolveIdUserFromToken(token);
    if (!idUser) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }
    req.idUser = idUser;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export const MiddleAdminRoute = async (
  req: CustomRequestI,
  res: Response,
  next: NextFunction,
) => {
  const userId = Number(req.idUser);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: "Sesión inválida" });
  }

  try {
    const user = await prisma.users.findFirst({
      where: { idUser: userId, active: 1 },
      select: { role: true },
    });
    if (user?.role !== "admin") {
      return res.status(403).json({
        ok: false,
        message: "No tienes permisos para administrar cotizaciones",
      });
    }
    next();
  } catch {
    return res.status(500).json({
      ok: false,
      message: "No fue posible validar los permisos administrativos",
    });
  }
};

/** Panel POS: admin (override) o support (vendedor/caja). */
export const MiddlePosRoute = async (
  req: CustomRequestI,
  res: Response,
  next: NextFunction,
) => {
  const userId = Number(req.idUser);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: "Sesión inválida" });
  }

  try {
    const user = await prisma.users.findFirst({
      where: { idUser: userId, active: 1 },
      select: { role: true },
    });
    if (user?.role !== "admin" && user?.role !== "support") {
      return res.status(403).json({
        ok: false,
        message: "No tienes permisos para operar el Punto de Venta",
      });
    }
    req.posRole = user.role;
    next();
  } catch {
    return res.status(500).json({
      ok: false,
      message: "No fue posible validar los permisos del Punto de Venta",
    });
  }
};
