import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import "../config/loadEnv";
import CustomRequestI from "../interfaces/customrequest.interface";
import { prisma } from "./../db/prismaClient";

export const MiddleAuthRoute = async (
  req: CustomRequestI,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    if (
      !token ||
      token === "null" ||
      token === "undefined" ||
      token === "false"
    ) {
      return res.status(401).json({ message: "Token no proporcionado" });
    }

    const secret = process.env.KEY_JWT || "";
    const decoded: any = jwt.verify(token!, secret);

    if (decoded) {
      if (!decoded.idUser) {
        const slcUser = await prisma.users.findFirst({
          where: {
            email: decoded.email,
          },
          select: {
            idUser: true,
          },
        });

        if (!slcUser?.idUser) {
          return res.status(401).json({ message: "Usuario no encontrado" });
        }
        req.idUser = slcUser.idUser;
        next();
        return;
      }
      req.idUser = decoded.idUser;
      next();
      return;
    } else {
      return res.status(401).json({ message: "Token expirado o invalido" });
    }
  } catch (err) {
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
