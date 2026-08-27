/**
 * Cancelación + reembolso del cliente vía política unificada de la pasarela.
 * Usa /orders/cancelOrder (evaluateOrderCancellation + shipments bloqueados).
 */
export declare function cancelOrderWithGatewayRefund(idOrder: number, userId: number, authorization?: string): Promise<any>;
/** Sincroniza status de envío en la pasarela (misma u otra BD). Best-effort. */
export declare function syncShipmentStatusOnPasarela(params: {
    idShipment: number;
    status: string;
    idUser?: number;
    authorization?: string;
}): Promise<{
    ok: false;
    skipped: boolean;
    data?: never;
} | {
    ok: true;
    data: any;
    skipped?: never;
}>;
//# sourceMappingURL=pasarelaPagos.service.d.ts.map