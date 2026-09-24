import { Prisma } from "@prisma/client";
/** Solo el catálogo propio (providerId=1) mueve stock en DB al vender/cancelar POS. */
export declare const POS_STOCK_PROVIDER_ID = 1;
export type PosStockLine = {
    productId: number;
    quantity: number;
    /** Bodega de origen; si falta, solo se mueve stock global (p.ej. PCinbox sin product_stock). */
    branchId?: number | null;
};
/**
 * Decrementa stock global + por bodega (si hay branchId) de forma atómica.
 * Ignora productos que no sean providerId=1.
 */
export declare function decrementPosStock(tx: Prisma.TransactionClient, lines: PosStockLine[], userId: number, refId: string): Promise<void>;
/**
 * Restaura stock global + bodega al cancelar una venta POS.
 * Solo providerId=1 (mismo criterio que el descuento).
 */
export declare function restorePosStock(tx: Prisma.TransactionClient, lines: PosStockLine[], userId: number, refId: string): Promise<void>;
//# sourceMappingURL=posStock.service.d.ts.map