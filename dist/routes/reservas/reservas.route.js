"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reservas_controller_1 = require("../../controllers/reservas/reservas.controller");
const index_middleware_1 = require("../../middleware/index.middleware");
const router = (0, express_1.Router)();
// Obtener detalles de una reservación por su referencia (público)
router.get("/get/:reference", reservas_controller_1.getReservationByRef);
// Consulta de disponibilidad de horarios para un día específico
router.get("/availability", reservas_controller_1.checkAvailability);
// Creación de reserva (público / token opcional para vincular al usuario)
router.post("/create", reservas_controller_1.createReservation);
// Cancelar y reprogramar reservas (público por referencia)
router.post("/cancel", reservas_controller_1.cancelReservation);
router.post("/reschedule", reservas_controller_1.rescheduleReservation);
// Historial del usuario autenticado
router.get("/getUserReservations", index_middleware_1.MiddleAuthRoute, reservas_controller_1.getUserReservations);
// Rutas de administración
router.get("/admin/getAll", index_middleware_1.MiddleAuthRoute, reservas_controller_1.getAdminReservations);
router.post("/admin/updateStatus", index_middleware_1.MiddleAuthRoute, reservas_controller_1.updateReservationStatus);
exports.default = router;
//# sourceMappingURL=reservas.route.js.map