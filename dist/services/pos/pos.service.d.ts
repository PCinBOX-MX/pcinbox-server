import { Prisma } from "@prisma/client";
declare const SELLER_MAX_DISCOUNT_PCT = 3;
export declare function roundMoney(n: number): number;
export declare function computeLineTotal(unitPrice: number, quantity: number, discountPct: number): number;
export declare function assertDiscountAllowed(discountPct: number, isAdmin: boolean): void;
export declare function nextPosFolio(tx: Prisma.TransactionClient): Promise<string>;
export declare function searchPosProducts(q: string, branchId: number, limit?: number): Promise<{
    idProduct: number;
    idProductExt: string | null;
    name: string;
    price: number;
    stockGlobal: number;
    stockBranch: number;
    sku: string | null;
    upc: string | null;
    marca: string | null;
    image_url: Prisma.JsonValue;
    score: number;
}[]>;
export { SELLER_MAX_DISCOUNT_PCT };
//# sourceMappingURL=pos.service.d.ts.map