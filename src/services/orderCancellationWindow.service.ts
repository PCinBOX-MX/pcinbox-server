import { order_status } from "@prisma/client";
import { getBusinessAwareDeadline } from "../utils/mexicoBusinessDays";

export const ORDER_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export const ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE =
  "Ya no es posible cancelar esta compra. El plazo es de 24 horas después del pago; si vence en fin de semana o día festivo nacional de descanso obligatorio, se extiende al siguiente día hábil.";

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

export function getOrderCancellationDeadline(
  paidReferenceDate: Date | null,
): Date | null {
  if (!paidReferenceDate) return null;
  return getBusinessAwareDeadline(
    paidReferenceDate,
    ORDER_CANCELLATION_WINDOW_MS,
  );
}

export function isWithinOrderCancellationWindow(
  paidReferenceDate: Date | null,
  now: Date = new Date(),
): boolean {
  const deadline = getOrderCancellationDeadline(paidReferenceDate);
  if (!deadline) return true;
  return now.getTime() <= deadline.getTime();
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
