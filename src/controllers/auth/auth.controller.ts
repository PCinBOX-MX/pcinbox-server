import { Request, Response } from "express";
import { verify } from "jsonwebtoken";
import { prisma } from "../../db/prismaClient";
import dotenv from "dotenv";

dotenv.config({ path: ".env.prod" });
export const getAuth = async (req: Request, res: Response) => {
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
    const decoded: any = verify(token, secret);

    if (decoded) {
      //Datos del usuario de dirección del envío

      let dataAddress = null;

      if (!decoded.idUser) {
        const slcUser = await prisma.users.findFirst({
          where: {
            email: decoded.email,
          },
        });

        dataAddress = await prisma.addresses.findMany({
          where: {
            userId: Number(slcUser?.idUser),
          },
          select: {
            street: true,
            noExt: true,
            noInt: true,
            cologne: true,
            city: true,
            state: true,
            country: true,
            postalCode: true,
            phone1: true,
            phone2: true,
          },
        });
      } else {
        dataAddress = await prisma.addresses.findMany({
          where: {
            userId: decoded.idUser,
          },
          select: {
            street: true,
            noExt: true,
            noInt: true,
            cologne: true,
            city: true,
            state: true,
            country: true,
            postalCode: true,
            phone1: true,
            phone2: true,
          },
        });
      }

      return res.status(200).json({
        ok: true,
        message: "Token correcto",
        data: {
          dataAddress,
        },
      });
    } else {
      return res
        .status(401)
        .json({ ok: false, message: "Token expirado o invalido" });
    }
  } catch (err) {
    return res
      .status(401)
      .json({ ok: false, message: "Token inválido o expirado" });
  }
};
