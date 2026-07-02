import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import CustomRequestI from "../interfaces/customrequest.interface";
import { prisma } from "./../db/prismaClient";

// const envFile = `.env.${process.env.NODE_ENV || "local"}`;
const envFile =
  process.env.NODE_ENV === "local" ||
  !process.env.NODE_ENV ||
  process.env.NODE_ENV === "development"
    ? ".env.local"
    : ".env.prod";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
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

        req.idUser = slcUser?.idUser;
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
