import { order_status } from "@prisma/client";

export const ORDER_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OrderPaidAtSource = {
  status?: order_status | null;
  createdAt?: Date | string | null;
};

function isPaidOrder(status: order_status | null | undefined): boolean {
  return status === "paid";
}

export function resolveOrderPaidAt(order: OrderPaidAtSource): Date | null {
  if (!isPaidOrder(order.status)) return null;
  if (!order.createdAt) return null;

  const date = new Date(order.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getOrderCancellationBlockMessage(): string {
  return "Ya no es posible cancelar esta compra. Solo puedes cancelar dentro de las 24 horas siguientes a la fecha de tu compra.";
}

export function isOrderWithinCancellationWindow(order: OrderPaidAtSource): boolean {
  if (!isPaidOrder(order.status)) return true;

  const paidAt = resolveOrderPaidAt(order);
  if (!paidAt || Number.isNaN(paidAt.getTime())) return true;

  return Date.now() - paidAt.getTime() <= ORDER_CANCELLATION_WINDOW_MS;
}
