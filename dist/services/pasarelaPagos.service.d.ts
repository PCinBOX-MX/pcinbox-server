/**
 * Cancelación + reembolso del cliente vía política unificada de la pasarela.
 * Usa /orders/cancelOrder (evaluateOrderCancellation + shipments bloqueados).
 */
export declare function cancelOrderWithGatewayRefund(idOrder: number, userId: number, authorization?: string, cancelReason?: string): Promise<any>;
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
export type LinkPayOnlineInput = {
    name: string;
    lastname?: string | null;
    email: string;
    phone: string;
    monto: number;
    products: Array<{
        idProduct?: number;
        name: string;
        price: number;
        quantity: number;
    }>;
};
export type LinkPayOnlineResult = {
    ok: boolean;
    link: string;
    checkoutLink?: string;
    referencia?: string;
    idLinkPago?: number;
    message?: string;
};
/** Crea link OpenPay (checkout) vía pasarela — mismo endpoint que Links de pago del admin. */
export declare function createLinkPayOnline(payload: LinkPayOnlineInput): Promise<LinkPayOnlineResult>;
//# sourceMappingURL=pasarelaPagos.service.d.ts.map