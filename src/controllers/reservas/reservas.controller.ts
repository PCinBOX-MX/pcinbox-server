import { prisma } from "../../db/prismaClient";
import { Response, Request } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import CustomRequestI from "../../interfaces/customrequest.interface";
import { parseBigInts } from "../../services/index.service";

dotenv.config({ path: ".env.prod" });

// Helper para extraer de manera opcional el idUser del header Bearer
const getUserIdFromHeader = (req: Request): number | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    if (!token || token === "null" || token === "undefined") return null;
    const secret = process.env.KEY_JWT || "";
    const decoded: any = jwt.verify(token, secret);
    return decoded ? Number(decoded.idUser) : null;
  } catch (err) {
    return null;
  }
};

export const createReservation = async (req: Request, res: Response) => {
  try {
    const {
      reference,
      service,
      deviceType,
      brand,
      model,
      description,
      date,
      time,
      contactName,
      contactEmail,
      contactPhone,
    } = req.body;

    if (
      !reference ||
      !service ||
      !deviceType ||
      !brand ||
      !model ||
      !description ||
      !date ||
      !time ||
      !contactName ||
      !contactEmail ||
      !contactPhone
    ) {
      return res.status(400).json({ ok: false, message: "Todos los campos son requeridos" });
    }

    const userId = getUserIdFromHeader(req);

    const newReservation = await prisma.reservas.create({
      data: {
        reference,
        service,
        deviceType,
        brand,
        model,
        description,
        date: new Date(date),
        time,
        contactName,
        contactEmail,
        contactPhone,
        userId: userId ? BigInt(userId) : null,
      },
    });

    return res.status(201).json({
      ok: true,
      message: "Reserva creada con éxito",
      data: parseBigInts(newReservation),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const cancelReservation = async (req: Request, res: Response) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ ok: false, message: "Referencia requerida" });
    }

    const findReservation = await prisma.reservas.findUnique({
      where: { reference },
    });

    if (!findReservation) {
      return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    }

    const updated = await prisma.reservas.update({
      where: { reference },
      data: { status: "cancelled" },
    });

    return res.status(200).json({
      ok: true,
      message: "Reserva cancelada con éxito",
      data: parseBigInts(updated),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const rescheduleReservation = async (req: Request, res: Response) => {
  try {
    const { reference, date, time } = req.body;

    if (!reference || !date || !time) {
      return res.status(400).json({ ok: false, message: "Referencia, fecha y hora requeridas" });
    }

    const findReservation = await prisma.reservas.findUnique({
      where: { reference },
    });

    if (!findReservation) {
      return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    }

    const updated = await prisma.reservas.update({
      where: { reference },
      data: {
        date: new Date(date),
        time,
        status: "pending",
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Reserva reprogramada con éxito",
      data: parseBigInts(updated),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const getUserReservations = async (req: CustomRequestI, res: Response) => {
  try {
    if (!req.idUser) {
      return res.status(400).json({ ok: false, message: "Usuario no autenticado" });
    }

    const userReservations = await prisma.reservas.findMany({
      where: {
        userId: BigInt(req.idUser),
      },
      orderBy: {
        date: "asc",
      },
    });

    return res.status(200).json({
      ok: true,
      message: "Reservaciones del usuario",
      data: parseBigInts(userReservations),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};
