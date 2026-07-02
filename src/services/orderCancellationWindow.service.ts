import { order_status } from "@prisma/client";

export const ORDER_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OrderPaidAtSource = {
  status?: order_status | null;
  updatedAt?: Date | string | null;
};

function isPaidOrder(status: order_status | null | undefined): boolean {
  return status === "paid";
}

export function resolveOrderPaidAt(order: OrderPaidAtSource): Date | null {
  if (order.status === "paid" && order.updatedAt) {
    return new Date(order.updatedAt);
  }
  return null;
}

export function getOrderCancellationBlockMessage(): string {
  return "Ya no es posible cancelar esta compra. El plazo de cancelación es de 24 horas después del pago.";
}

export function isOrderWithinCancellationWindow(order: OrderPaidAtSource): boolean {
  if (!isPaidOrder(order.status)) return true;

  const paidAt = resolveOrderPaidAt(order);
  if (!paidAt || Number.isNaN(paidAt.getTime())) return true;

  return Date.now() - paidAt.getTime() <= ORDER_CANCELLATION_WINDOW_MS;
}
