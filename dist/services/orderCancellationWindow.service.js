"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_CANCELLATION_WINDOW_MS = void 0;
exports.resolveOrderPaidAt = resolveOrderPaidAt;
exports.getOrderCancellationBlockMessage = getOrderCancellationBlockMessage;
exports.isOrderWithinCancellationWindow = isOrderWithinCancellationWindow;
exports.ORDER_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
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
    return "Ya no es posible cancelar esta compra. Solo puedes cancelar dentro de las 24 horas siguientes a la fecha de tu compra.";
}
function isOrderWithinCancellationWindow(order) {
    if (!isPaidOrder(order.status))
        return true;
    const paidAt = resolveOrderPaidAt(order);
    if (!paidAt || Number.isNaN(paidAt.getTime()))
        return true;
    return Date.now() - paidAt.getTime() <= exports.ORDER_CANCELLATION_WINDOW_MS;
}
//# sourceMappingURL=orderCancellationWindow.service.js.map