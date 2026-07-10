import { Router } from "express";
import {
  createReservation,
  cancelReservation,
  rescheduleReservation,
  getUserReservations,
  checkAvailability,
  getReservationByRef,
  getAdminReservations,
  updateReservationStatus,
} from "../../controllers/reservas/reservas.controller";
import { MiddleAuthRoute } from "../../middleware/index.middleware";

const router = Router();

// Obtener detalles de una reservación por su referencia (público)
router.get("/get/:reference", getReservationByRef);

// Consulta de disponibilidad de horarios para un día específico
router.get("/availability", checkAvailability);

// Creación de reserva (público / token opcional para vincular al usuario)
router.post("/create", createReservation);

// Cancelar y reprogramar reservas (público por referencia)
router.post("/cancel", cancelReservation);
router.post("/reschedule", rescheduleReservation);

// Historial del usuario autenticado
router.get("/getUserReservations", MiddleAuthRoute, getUserReservations);

// Rutas de administración
router.get("/admin/getAll", MiddleAuthRoute, getAdminReservations);
router.post("/admin/updateStatus", MiddleAuthRoute, updateReservationStatus);

export default router;
