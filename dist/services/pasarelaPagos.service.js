"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOrderWithGatewayRefund = cancelOrderWithGatewayRefund;
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
async function cancelOrderWithGatewayRefund(idOrder, userId, authorization) {
    const baseURL = resolvePasarelaBaseUrl();
    if (!baseURL) {
        throw new Error("API_URL_PAGOS no está configurada en el servidor");
    }
    const response = await axios_1.default.post(`${baseURL}/openpay/cancelledPaymantOpenPay`, { idOrder, userId }, {
        ...(authorization
            ? { headers: { Authorization: authorization } }
            : {}),
        timeout: 30000,
    });
    return response.data;
}
//# sourceMappingURL=pasarelaPagos.service.js.map