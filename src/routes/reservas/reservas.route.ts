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

// Obtener detalles de una reservación por su referencia
router.get("/get/:reference", getReservationByRef);

// Consulta de disponibilidad de horarios para un día específico
router.get("/availability", checkAvailability);

// Creación de reserva (público / token opcional)
router.post("/create", createReservation);

// Cancelar y reprogramar reservas
router.post("/cancel", cancelReservation);
router.post("/reschedule", rescheduleReservation);

// Obtener las reservas del usuario autenticado (requiere token)
router.get("/getUserReservations", MiddleAuthRoute, getUserReservations);

// Obtener el detalle de una reservación por referencia
router.get("/get/:reference", MiddleAuthRoute, getReservationByRef);

// Rutas de administración
router.get("/admin/getAll", MiddleAuthRoute, getAdminReservations);
router.post("/admin/updateStatus", MiddleAuthRoute, updateReservationStatus);

export default router;
