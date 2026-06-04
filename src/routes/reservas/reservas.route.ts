import { Router } from "express";
import {
  createReservation,
  cancelReservation,
  rescheduleReservation,
  getUserReservations,
} from "../../controllers/reservas/reservas.controller";
import { MiddleAuthRoute } from "../../middleware/index.middleware";

const router = Router();

// Creación de reserva (público / token opcional)
router.post("/create", createReservation);

// Cancelar y reprogramar reservas
router.post("/cancel", cancelReservation);
router.post("/reschedule", rescheduleReservation);

// Obtener las reservas del usuario autenticado (requiere token)
router.get("/getUserReservations", MiddleAuthRoute, getUserReservations);

export default router;
