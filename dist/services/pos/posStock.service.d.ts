import { Prisma } from "@prisma/client";
export type PosStockLine = {
    productId: number;
    quantity: number;
};
/**
 * Decrementa stock global + por sucursal de forma atómica.
 * Falla si no hay existencia suficiente.
 */
export declare function decrementPosStock(tx: Prisma.TransactionClient, lines: PosStockLine[], branchId: number, userId: number, refId: string): Promise<void>;
/**
 * Restaura stock global + sucursal al cancelar una venta POS.
 */
export declare function restorePosStock(tx: Prisma.TransactionClient, lines: PosStockLine[], branchId: number, userId: number, refId: string): Promise<void>;
//# sourceMappingURL=posStock.service.d.ts.map