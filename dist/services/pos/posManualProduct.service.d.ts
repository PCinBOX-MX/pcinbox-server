import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
/** SKU comodín: producto capturado a mano en POS. */
export declare const POS_MANUAL_PRODUCT_SKU = "__POS_MANUAL__";
/** SKU comodín: servicio adicional capturado en POS. */
export declare const POS_MANUAL_SERVICE_SKU = "__POS_SERVICE__";
export type PosManualKind = "product" | "service";
type DbClient = typeof prisma | Prisma.TransactionClient;
/** @deprecated Prefer ensurePosManualLineProduct(kind) */
export declare function ensurePosManualProduct(tx?: DbClient): Promise<{
    name: string;
    providerId: bigint;
    idProduct: bigint;
    price: Prisma.Decimal;
    stock: number;
    sku: string | null;
    upc: string | null;
    requiresSerial: boolean;
    warrantyMonths: number | null;
}>;
export declare function ensurePosManualLineProduct(kind?: PosManualKind, tx?: DbClient): Promise<{
    name: string;
    providerId: bigint;
    idProduct: bigint;
    price: Prisma.Decimal;
    stock: number;
    sku: string | null;
    upc: string | null;
    requiresSerial: boolean;
    warrantyMonths: number | null;
}>;
/** IDs de comodines que no deben tocar inventario. */
export declare function getPosManualPlaceholderIds(tx?: DbClient): Promise<number[]>;
export {};
//# sourceMappingURL=posManualProduct.service.d.ts.map