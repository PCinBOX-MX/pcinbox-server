import {
  getOrderCancellationDeadline,
  isWithinOrderCancellationWindow,
  ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE,
  ORDER_CANCELLATION_WINDOW_MS,
} from "@pcinbox/core";
import { order_status } from "@prisma/client";

export { ORDER_CANCELLATION_WINDOW_MS };

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
  return ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE;
}

export function isOrderWithinCancellationWindow(
  order: OrderPaidAtSource,
): boolean {
  if (!isPaidOrder(order.status)) return true;

  const paidAt = resolveOrderPaidAt(order);
  if (!paidAt || Number.isNaN(paidAt.getTime())) return true;

  return isWithinOrderCancellationWindow(paidAt);
}

export function getOrderCancellationDeadlineForOrder(
  order: OrderPaidAtSource,
): Date | null {
  return getOrderCancellationDeadline(resolveOrderPaidAt(order));
}
