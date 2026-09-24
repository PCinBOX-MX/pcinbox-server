import { order_status } from "@prisma/client";
export declare const ORDER_CANCELLATION_WINDOW_MS: number;
export declare const ORDER_CANCELLATION_WINDOW_EXPIRED_MESSAGE = "Ya no es posible cancelar esta compra. El plazo es de 24 horas despu\u00E9s del pago; si vence en fin de semana o d\u00EDa festivo nacional de descanso obligatorio, se extiende al siguiente d\u00EDa h\u00E1bil.";
export type OrderPaidAtSource = {
    status?: order_status | null;
    createdAt?: Date | string | null;
};
export declare function resolveOrderPaidAt(order: OrderPaidAtSource): Date | null;
export declare function getOrderCancellationBlockMessage(): string;
export declare function getOrderCancellationDeadline(paidReferenceDate: Date | null): Date | null;
export declare function isWithinOrderCancellationWindow(paidReferenceDate: Date | null, now?: Date): boolean;
export declare function isOrderWithinCancellationWindow(order: OrderPaidAtSource): boolean;
export declare function getOrderCancellationDeadlineForOrder(order: OrderPaidAtSource): Date | null;
//# sourceMappingURL=orderCancellationWindow.service.d.ts.map