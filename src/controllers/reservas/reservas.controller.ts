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
    const parsedDate = new Date(date);

    // Validar disponibilidad antes de crear
    const existingReservation = await prisma.reservas.findFirst({
      where: {
        date: parsedDate,
        time,
        status: { not: "cancelled" }
      }
    });

    if (existingReservation) {
      return res.status(400).json({ ok: false, message: "El horario seleccionado ya no está disponible para este día" });
    }

    const newReservation = await prisma.reservas.create({
      data: {
        reference,
        service,
        deviceType,
        brand,
        model,
        description,
        date: parsedDate,
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

    const parsedDate = new Date(date);

    // Validar disponibilidad del nuevo slot (excluyendo la reserva que se está reprogramando)
    const existingReservation = await prisma.reservas.findFirst({
      where: {
        date: parsedDate,
        time,
        status: { not: "cancelled" },
        NOT: {
          reference: reference
        }
      }
    });

    if (existingReservation) {
      return res.status(400).json({ ok: false, message: "El nuevo horario seleccionado ya está ocupado" });
    }

    const updated = await prisma.reservas.update({
      where: { reference },
      data: {
        date: parsedDate,
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

export const checkAvailability = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({ ok: false, message: "La fecha es requerida y debe ser un texto válido" });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ ok: false, message: "El formato de fecha debe ser YYYY-MM-DD" });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ ok: false, message: "Fecha inválida" });
    }

    const activeReservations = await prisma.reservas.findMany({
      where: {
        date: parsedDate,
        status: { not: "cancelled" }
      }
    });

    const timeSlots = ["12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM"];
    
    const slotsMap = timeSlots.map(time => {
      const isOccupied = activeReservations.some(r => r.time === time);
      return {
        time,
        available: !isOccupied,
        spotsLeft: isOccupied ? 0 : 1
      };
    });

    return res.status(200).json({
      ok: true,
      date,
      slots: slotsMap
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error al consultar disponibilidad",
      error: error.message
    });
  }
};
