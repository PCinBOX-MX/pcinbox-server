import { order_status } from "@prisma/client";
export declare const ORDER_CANCELLATION_WINDOW_MS: number;
export type OrderPaidAtSource = {
    status?: order_status | null;
    createdAt?: Date | string | null;
};
export declare function resolveOrderPaidAt(order: OrderPaidAtSource): Date | null;
export declare function getOrderCancellationBlockMessage(): string;
export declare function isOrderWithinCancellationWindow(order: OrderPaidAtSource): boolean;
//# sourceMappingURL=orderCancellationWindow.service.d.ts.map