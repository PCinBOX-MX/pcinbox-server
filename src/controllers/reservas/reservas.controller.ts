import { prisma } from "../../db/prismaClient";
import { Response, Request } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import CustomRequestI from "../../interfaces/customrequest.interface";
import { parseBigInts } from "../../services/index.service";
import { sendEmailResend, sendReservationStatusUpdateEmail, getReservationStatusLabel, getReservationStatusMessage } from "../../services/resend.service";

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

// Helper para comprobar si un día es feriado oficial en México
const isHoliday = (date: Date): boolean => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = Ene, 1 = Feb, etc.
  const day = date.getUTCDate();
  const dayOfWeek = date.getUTCDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb

  // 1 de Enero (Año Nuevo)
  if (month === 0 && day === 1) return true;

  // Primer lunes de Febrero (Día de la Constitución)
  if (month === 1 && dayOfWeek === 1 && day >= 1 && day <= 7) return true;

  // Tercer lunes de Marzo (Natalicio de Benito Juárez)
  if (month === 2 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;

  // 1 de Mayo (Día del Trabajo)
  if (month === 4 && day === 1) return true;

  // 16 de Septiembre (Día de la Independencia)
  if (month === 8 && day === 16) return true;

  // Tercer lunes de Noviembre (Día de la Revolución)
  if (month === 10 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;

  // 25 de Diciembre (Navidad)
  if (month === 11 && day === 25) return true;

  // Transmisión del Poder Ejecutivo Federal (1 de octubre cada 6 años)
  if (month === 9 && day === 1 && (year === 2024 || year === 2030 || year === 2036)) return true;

  // 2 de Noviembre (Día de Muertos - Inhábil común)
  if (month === 10 && day === 2) return true;

  return false;
};

const getReservationDetailUrl = (reference: string): string => {
  const baseUrl = (process.env.BASE_URL_APP || "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}/reservas/mantenimiento/${reference}`;
};

const notifyReservationStatusChange = async (
  reservation: {
    contactEmail: string;
    contactName: string;
    reference: string;
    service: string;
    deviceType: string;
    date: Date;
    time: string;
  },
  status: string,
  cancelReason?: string,
) => {
  if (!reservation.contactEmail) return;

  await sendReservationStatusUpdateEmail(reservation.contactEmail, {
    contactName: reservation.contactName,
    reference: reservation.reference,
    status,
    statusText: getReservationStatusLabel(status),
    ...(cancelReason ? { statusReason: cancelReason } : {}),
    statusMessage:
      status === "cancelled" && cancelReason
        ? "Tu cita de mantenimiento ha sido cancelada."
        : getReservationStatusMessage(status),
    appointmentDate: reservation.date
      ? new Date(reservation.date).toLocaleDateString("es-MX", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
    appointmentTime: reservation.time,
    deviceType: reservation.deviceType,
    service: reservation.service,
    detailUrl: getReservationDetailUrl(reservation.reference),
  });
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

    // Validar que un mismo usuario no pueda agendar más de un horario por día
    if (userId) {
      const existingUserReservationOnDay = await prisma.reservas.findFirst({
        where: {
          userId: BigInt(userId),
          date: parsedDate,
          status: { not: "cancelled" }
        }
      });

      if (existingUserReservationOnDay) {
        return res.status(400).json({
          ok: false,
          message: "Ya tienes una reservación activa agendada para este día. Máximo una reservación por día."
        });
      }
    }

    // Validar que no sea fin de semana (Sábado o Domingo)
    const dayOfWeek = parsedDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ ok: false, message: "No se labora en fines de semana" });
    }

    // Validar que no sea día feriado (inhábil)
    if (isHoliday(parsedDate)) {
      return res.status(400).json({ ok: false, message: "La fecha seleccionada corresponde a un día feriado (inhábil)" });
    }

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
        model: typeof model === "string" ? model.trim() : "",
        description,
        date: parsedDate,
        time,
        contactName,
        contactEmail,
        contactPhone,
        userId: userId ? BigInt(userId) : null,
      },
    });

    if (newReservation) {
        const dateFormatter = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formattedDate = newReservation.date ? dateFormatter.format(new Date(newReservation.date)) : newReservation.createdAt?.toDateString()!;

        await sendEmailResend(
          newReservation.contactEmail,
          "Reservacion de cita para mantenimiento",
          "reservation-client", {
          USERNAME: newReservation.contactName,
          FOLIO: newReservation.reference,
          DATE: formattedDate,
          TIME: newReservation.time,
          DEVICE: `${newReservation.deviceType} (${newReservation.brand} ${newReservation.model})`,
          DESCRIPTION: newReservation.description,
          SERVICE: newReservation.service
        })

        await sendEmailResend(
          "admon@pcinbox.com.mx",
          "Reservacion de cita para mantenimiento",
          "reservation-admin", {
          USERNAME: newReservation.contactName,
          EMAIL: newReservation.contactEmail,
          PHONE: newReservation.contactPhone,
          FOLIO: newReservation.reference,
          DATE: formattedDate,
          TIME: newReservation.time,
          DEVICE: `${newReservation.deviceType} (${newReservation.brand} ${newReservation.model})`,
          DESCRIPTION: newReservation.description,
          SERVICE: newReservation.service
        })

      return res.status(201).json({
        ok: true,
        message: "Reserva creada con éxito",
        data: parseBigInts(newReservation),
      });
    }


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
    const { reference, cancelReason } = req.body;

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
      data: {
        status: "cancelled",
        cancelReason: cancelReason || "Cancelada por el cliente",
        
      },
    });

    try {
      await notifyReservationStatusChange(
        updated,
        "cancelled",
        updated.cancelReason || "Cancelada por el cliente",
      );
    } catch (emailErr) {
      console.error("Error al enviar notificación de cancelación por correo:", emailErr);
    }

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

    // Validar que no sea fin de semana (Sábado o Domingo)
    const dayOfWeek = parsedDate.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ ok: false, message: "No se labora en fines de semana" });
    }

    // Validar que no sea día feriado (inhábil)
    if (isHoliday(parsedDate)) {
      return res.status(400).json({ ok: false, message: "La fecha seleccionada corresponde a un día feriado (inhábil)" });
    }

    // Validar que el usuario no tenga otra reserva activa en el nuevo día
    const userId = findReservation.userId;
    if (userId) {
      const existingUserReservationOnDay = await prisma.reservas.findFirst({
        where: {
          userId: userId,
          date: parsedDate,
          status: { not: "cancelled" },
          NOT: {
            reference: reference
          }
        }
      });
      if (existingUserReservationOnDay) {
        return res.status(400).json({
          ok: false,
          message: "Ya tienes otra reservación activa agendada para el día seleccionado. Máximo una reservación por día."
        });
      }
    }

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

      if (updated) {
        const dateFormatter = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formattedDate = updated.date ? dateFormatter.format(new Date(updated.date)) : updated.createdAt?.toDateString()!;

        await sendEmailResend(
          updated.contactEmail,
          "Reserva reprogramada con éxito",
          "reservation-client", {
          USERNAME: updated.contactName,
          FOLIO: updated.reference,
          DATE: formattedDate,
          TIME: updated.time,
          DEVICE: `${updated.deviceType} (${updated.brand} ${updated.model})`,
          DESCRIPTION: updated.description,
          SERVICE: updated.service
        })

        await sendEmailResend(
          "admon@pcinbox.com.mx",
          "Reserva reprogramada con éxito",
          "reservation-admin", {
          USERNAME: updated.contactName,
          EMAIL: updated.contactEmail,
          PHONE: updated.contactPhone,
          FOLIO: updated.reference,
          DATE: formattedDate,
          TIME: updated.time,
          DEVICE: `${updated.deviceType} (${updated.brand} ${updated.model})`,
          DESCRIPTION: updated.description,
          SERVICE: updated.service
        })
      return res.status(201).json({
        ok: true,
        message: "Reserva reprogramada con éxito",
        data: parseBigInts(updated),
      });
    }


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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;
    const date = req.query.date as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const whereClause: any = {
      userId: BigInt(req.idUser),
    };

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.date.lte = new Date(endDate);
      }
    } else if (date) {
      whereClause.date = new Date(date);
    }

    if (search) {
      whereClause.OR = [
        { reference: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
        { service: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [reservations, total] = await prisma.$transaction([
      prisma.reservas.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.reservas.count({
        where: whereClause,
      }),
    ]);

    return res.status(200).json({
      ok: true,
      message: "Reservaciones del usuario",
      data: parseBigInts(reservations),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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

    const dayOfWeek = parsedDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isDayHoliday = isHoliday(parsedDate);

    const timeSlots = ["11:00 AM", "02:00 PM", "05:00 PM"];

    if (isWeekend || isDayHoliday) {
      const slotsMap = timeSlots.map(time => ({
        time,
        available: false,
        spotsLeft: 0
      }));
      return res.status(200).json({
        ok: true,
        date,
        slots: slotsMap,
        message: isWeekend ? "Fin de semana (No laboral)" : "Día feriado (Inhábil)"
      });
    }

    const activeReservations = await prisma.reservas.findMany({
      where: {
        date: parsedDate,
        status: { not: "cancelled" }
      }
    });

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

export const getReservationByReference = async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ ok: false, message: "Referencia requerida" });
    }

    const reservation = await prisma.reservas.findUnique({
      where: { reference }
    });

    if (!reservation) {
      return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    }

    return res.status(200).json({
      ok: true,
      data: parseBigInts(reservation)
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error al obtener la reserva",
      error: error.message
    });
  }
};

export const getReservationByRef = async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ ok: false, message: "Referencia requerida" });
    }

    const reservation = await prisma.reservas.findUnique({
      where: { reference },
    });

    if (!reservation) {
      return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    }

    return res.status(200).json({
      ok: true,
      message: "Detalle de reservación",
      data: parseBigInts(reservation),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
};

export const getAdminReservations = async (req: CustomRequestI, res: Response) => {
  try {
    const adminUser = await prisma.users.findUnique({
      where: { idUser: Number(req.idUser) },
      select: { role: true }
    });

    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ ok: false, message: "Acceso denegado. Se requieren permisos de administrador." });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;
    const date = req.query.date as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const whereClause: any = {};

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.date.lte = new Date(endDate);
      }
    } else if (date) {
      whereClause.date = new Date(date);
    }

    if (search) {
      whereClause.OR = [
        { reference: { contains: search } },
        { contactName: { contains: search } },
        { contactEmail: { contains: search } },
        { contactPhone: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
        { service: { contains: search } }
      ];
    }

    const [total, data] = await prisma.$transaction([
      prisma.reservas.count({ where: whereClause }),
      prisma.reservas.findMany({
        where: whereClause,
        orderBy: [
          { createdAt: "desc" }
        ],
        skip,
        take: limit,
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      ok: true,
      message: "Listado de reservas de administración",
      data: parseBigInts(data),
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error al obtener reservas del sistema",
      error: error.message
    });
  }
};

export const updateReservationStatus = async (req: CustomRequestI, res: Response) => {
  try {
    const adminUser = await prisma.users.findUnique({
      where: { idUser: Number(req.idUser) },
      select: { role: true }
    });

    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ ok: false, message: "Acceso denegado. Se requieren permisos de administrador." });
    }

    const { reference, status, cancelReason } = req.body;
    const resolvedCancelReason =
      status === "cancelled" ? String(cancelReason || "").trim() : "";

    if (!reference || !status) {
      return res.status(400).json({ ok: false, message: "Referencia y estatus requeridos" });
    }

    if (status === "cancelled" && !resolvedCancelReason) {
      return res.status(400).json({
        ok: false,
        message: "El motivo de la cancelación es requerido",
      });
    }

    const existingReservation = await prisma.reservas.findUnique({
      where: { reference }
    });

    if (!existingReservation) {
      return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    }

    if (existingReservation.status === "cancelled") {
      return res.status(400).json({ ok: false, message: "No se puede cambiar el estatus de una reserva ya cancelada." });
    }

    const updated = await prisma.reservas.update({
      where: { reference },
      data: {
        status,
        ...(status === "cancelled"
          ? {
              cancelReason: resolvedCancelReason,
              statusReason: resolvedCancelReason,
            }
          : {}),
      },
    });

    try {
      if (updated.contactEmail) {
        await notifyReservationStatusChange(
          updated,
          status,
          status === "cancelled" ? resolvedCancelReason : undefined,
        );
      }
    } catch (emailErr) {
      console.error("Error al enviar notificación de cambio de estatus por correo:", emailErr);
    }

    return res.status(200).json({
      ok: true,
      message: "Estatus de reserva actualizado correctamente",
      data: parseBigInts(updated)
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
      error: error.message
    });
  }
};