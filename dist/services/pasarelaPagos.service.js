"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOrderWithGatewayRefund = cancelOrderWithGatewayRefund;
exports.syncShipmentStatusOnPasarela = syncShipmentStatusOnPasarela;
const axios_1 = __importDefault(require("axios"));
function resolvePasarelaBaseUrl() {
    const configured = process.env.API_URL_PAGOS?.trim().replace(/\/$/, "");
    if (configured)
        return configured;
    if (process.env.NODE_ENV === "local" ||
        !process.env.NODE_ENV ||
        process.env.NODE_ENV === "development") {
        return "http://localhost:8009/api/v1";
    }
    return "";
}
/**
 * Cancelación + reembolso del cliente vía política unificada de la pasarela.
 * Usa /orders/cancelOrder (evaluateOrderCancellation + shipments bloqueados).
 */
async function cancelOrderWithGatewayRefund(idOrder, userId, authorization) {
    const baseURL = resolvePasarelaBaseUrl();
    if (!baseURL) {
        throw new Error("API_URL_PAGOS no está configurada en el servidor");
    }
    const response = await axios_1.default.post(`${baseURL}/orders/cancelOrder`, { idOrder, userId }, {
        ...(authorization
            ? { headers: { Authorization: authorization } }
            : {}),
        timeout: 30000,
    });
    return response.data;
}
/** Sincroniza status de envío en la pasarela (misma u otra BD). Best-effort. */
async function syncShipmentStatusOnPasarela(params) {
    const baseURL = resolvePasarelaBaseUrl();
    if (!baseURL)
        return { ok: false, skipped: true };
    try {
        const response = await axios_1.default.post(`${baseURL}/openpay/updateStatusShipByOrden`, {
            idShipment: params.idShipment,
            status: params.status,
            idUser: params.idUser,
        }, {
            ...(params.authorization
                ? { headers: { Authorization: params.authorization } }
                : {}),
            timeout: 15000,
        });
        return { ok: true, data: response.data };
    }
    catch (error) {
        console.error("[syncShipmentStatusOnPasarela] No se pudo sincronizar status de envío", error);
        return { ok: false, skipped: false };
    }
}
//# sourceMappingURL=pasarelaPagos.service.js.map