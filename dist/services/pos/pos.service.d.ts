import { Prisma } from "@prisma/client";
import { getProductSerialFlags } from "./posSerialFlags.service";
declare const SELLER_MAX_DISCOUNT_PCT = 3;
export declare function roundMoney(n: number): number;
export declare function computeLineTotal(unitPrice: number, quantity: number, discountPct: number): number;
export declare function assertDiscountAllowed(discountPct: number, isAdmin: boolean): void;
export declare function nextPosFolio(tx: Prisma.TransactionClient): Promise<string>;
export type PosBranchStock = {
    branchId: number;
    name: string | null;
    city: string | null;
    providerId: number;
    providerName: string | null;
    stock: number;
    label: string;
};
/**
 * Búsqueda POS rápida: WHERE liviano (sin description/joins),
 * stock en una 2ª consulta, score en memoria.
 */
export declare function searchPosProducts(q: string, limit?: number): Promise<{
    idProduct: number;
    idProductExt: any;
    name: any;
    price: number;
    stockGlobal: number;
    stockBranch: number;
    sku: any;
    upc: any;
    marca: any;
    category: any;
    image_url: any;
    requiresSerial: boolean;
    warrantyMonths: number | null;
    warrantyMode: string | null;
    isPC: boolean;
    providerId: number;
    providerName: any;
    stocksByBranch: PosBranchStock[];
    suggestedBranchId: number | null;
    inStock: boolean;
    score: number;
}[]>;
export declare function invalidatePosSearchCatalog(): void;
/** Hidrata productos por id con el mismo shape que search (stock por bodega). */
export declare function hydratePosProductsByIds(productIds: number[]): Promise<{
    idProduct: number;
    idProductExt: any;
    name: any;
    price: number;
    stockGlobal: number;
    stockBranch: number;
    sku: any;
    upc: any;
    marca: any;
    category: any;
    image_url: any;
    requiresSerial: boolean;
    warrantyMonths: number | null;
    warrantyMode: string | null;
    isPC: boolean;
    providerId: number;
    providerName: any;
    stocksByBranch: PosBranchStock[];
    suggestedBranchId: number | null;
    inStock: boolean;
    score: number;
}[]>;
export { SELLER_MAX_DISCOUNT_PCT, getProductSerialFlags };
//# sourceMappingURL=pos.service.d.ts.map