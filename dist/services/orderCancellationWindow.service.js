"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE = exports.ORDER_CANCELLATION_WINDOW_MS = void 0;
exports.resolveOrderPaidAt = resolveOrderPaidAt;
exports.getOrderCancellationBlockMessage = getOrderCancellationBlockMessage;
exports.getOrderCancellationDeadline = getOrderCancellationDeadline;
exports.isWithinOrderCancellationWindow = isWithinOrderCancellationWindow;
exports.isOrderWithinCancellationWindow = isOrderWithinCancellationWindow;
exports.getOrderCancellationDeadlineForOrder = getOrderCancellationDeadlineForOrder;
const mexicoBusinessDays_1 = require("../utils/mexicoBusinessDays");
exports.ORDER_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
exports.ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE = "Ya no es posible cancelar esta compra. El plazo es de 24 horas después del pago; si vence en fin de semana o día festivo nacional de descanso obligatorio, se extiende al siguiente día hábil.";
function isPaidOrder(status) {
    return status === "paid";
}
function resolveOrderPaidAt(order) {
    if (!isPaidOrder(order.status))
        return null;
    if (!order.createdAt)
        return null;
    const date = new Date(order.createdAt);
    return Number.isNaN(date.getTime()) ? null : date;
}
function getOrderCancellationBlockMessage() {
    return exports.ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE;
}
function getOrderCancellationDeadline(paidReferenceDate) {
    if (!paidReferenceDate)
        return null;
    return (0, mexicoBusinessDays_1.getBusinessAwareDeadline)(paidReferenceDate, exports.ORDER_CANCELLATION_WINDOW_MS);
}
function isWithinOrderCancellationWindow(paidReferenceDate, now = new Date()) {
    const deadline = getOrderCancellationDeadline(paidReferenceDate);
    if (!deadline)
        return true;
    return now.getTime() <= deadline.getTime();
}
function isOrderWithinCancellationWindow(order) {
    if (!isPaidOrder(order.status))
        return true;
    const paidAt = resolveOrderPaidAt(order);
    if (!paidAt || Number.isNaN(paidAt.getTime()))
        return true;
    return isWithinOrderCancellationWindow(paidAt);
}
function getOrderCancellationDeadlineForOrder(order) {
    return getOrderCancellationDeadline(resolveOrderPaidAt(order));
}
//# sourceMappingURL=orderCancellationWindow.service.js.map