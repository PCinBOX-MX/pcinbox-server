import { Prisma } from "@prisma/client";
export declare function serializeSerial(row: any): {
    idProductSerial: number;
    productId: number;
    productName: any;
    productSku: any;
    serialNumber: any;
    branchId: number | null;
    branchName: any;
    status: any;
    posSaleId: number | null;
    posSaleItemId: number | null;
    folio: any;
    customerUserId: number | null;
    customerName: any;
    soldAt: any;
    warrantyMonths: any;
    warrantyMode: any;
    warrantyExpiresAt: any;
    notes: any;
    createdAt: any;
    updatedAt: any;
};
/** Misma clave para comparar una serie contra un UPC (espacios y guiones no cuentan). */
export declare function serialKey(value: string | null | undefined): string;
export declare function serialMatchesProductCode(serial: string | null | undefined, code: string | null | undefined): boolean;
export declare function isSharedBarcodeSerial(serial: string, codes: Array<string | null | undefined>): boolean;
/** La serie es el UPC de esta línea o el UPC de algún producto del catálogo. */
export declare function serialIsSharedBarcode(serial: string, productUpc: string | null | undefined, catalogKeys: Set<string>): boolean;
export declare function loadSharedBarcodeKeys(tx: Prisma.TransactionClient, serials: string[]): Promise<Set<string>>;
export type SharedSerialGroup = {
    productId: number;
    productName: string;
    serials: string[];
    warrantyMonths: number | null;
    warrantyMode: string | null;
};
export declare function readSharedSerialGroups(events: Array<{
    eventType?: string;
    payload?: unknown;
}> | null | undefined): SharedSerialGroup[];
/** Agrega al ticket y a la garantía las series que son UPC y no viven en product_serials. */
export declare function mergeSharedBarcodeSerials<T extends {
    productId: number | bigint;
    productName?: string | null;
    serials?: Array<Record<string, unknown>>;
}>(items: T[], groups: SharedSerialGroup[]): T[];
/** Valida y normaliza series por línea de venta. */
export declare function normalizeItemSerials(quantity: number, requiresSerial: boolean, rawSerials: unknown, productLabel: string, productCodes?: Array<string | null | undefined>): string[];
export declare function assertSerialsAvailable(tx: Prisma.TransactionClient, serials: string[], productCodes?: Array<string | null | undefined>): Promise<void>;
export declare function assignSerialsOnSale(tx: Prisma.TransactionClient, params: {
    productId: number;
    branchId: number;
    posSaleId: bigint | number;
    posSaleItemId: bigint | number;
    serials: string[];
    customerUserId: number | null;
    customerName: string | null;
    warrantyMonths: number | null;
    warrantyMode?: string | null;
    soldAt?: Date;
    /** Folio reimportado: la serie ya puede estar vendida en la venta anterior. */
    allowAlreadySold?: boolean;
    /** UPC de la línea: si la serie es ese código, no se registra como serie única. */
    productUpc?: string | null;
}): Promise<void>;
export declare function releaseSerialsOnCancel(tx: Prisma.TransactionClient, posSaleId: bigint | number): Promise<void>;
export declare function searchSerials(q: string, limit?: number): Promise<{
    idProductSerial: number;
    productId: number;
    productName: any;
    productSku: any;
    serialNumber: any;
    branchId: number | null;
    branchName: any;
    status: any;
    posSaleId: number | null;
    posSaleItemId: number | null;
    folio: any;
    customerUserId: number | null;
    customerName: any;
    soldAt: any;
    warrantyMonths: any;
    warrantyMode: any;
    warrantyExpiresAt: any;
    notes: any;
    createdAt: any;
    updatedAt: any;
}[]>;
export declare function getSerialByNumber(serialNumber: string): Promise<{
    idProductSerial: number;
    productId: number;
    productName: any;
    productSku: any;
    serialNumber: any;
    branchId: number | null;
    branchName: any;
    status: any;
    posSaleId: number | null;
    posSaleItemId: number | null;
    folio: any;
    customerUserId: number | null;
    customerName: any;
    soldAt: any;
    warrantyMonths: any;
    warrantyMode: any;
    warrantyExpiresAt: any;
    notes: any;
    createdAt: any;
    updatedAt: any;
} | null>;
export declare function markSerialRma(params: {
    serialNumber: string;
    notes?: string | null;
}): Promise<{
    idProductSerial: number;
    productId: number;
    productName: any;
    productSku: any;
    serialNumber: any;
    branchId: number | null;
    branchName: any;
    status: any;
    posSaleId: number | null;
    posSaleItemId: number | null;
    folio: any;
    customerUserId: number | null;
    customerName: any;
    soldAt: any;
    warrantyMonths: any;
    warrantyMode: any;
    warrantyExpiresAt: any;
    notes: any;
    createdAt: any;
    updatedAt: any;
}>;
export declare function registerAvailableSerial(params: {
    productId: number;
    serialNumber: string;
    branchId?: number | null;
    notes?: string | null;
}): Promise<{
    idProductSerial: number;
    productId: number;
    productName: any;
    productSku: any;
    serialNumber: any;
    branchId: number | null;
    branchName: any;
    status: any;
    posSaleId: number | null;
    posSaleItemId: number | null;
    folio: any;
    customerUserId: number | null;
    customerName: any;
    soldAt: any;
    warrantyMonths: any;
    warrantyMode: any;
    warrantyExpiresAt: any;
    notes: any;
    createdAt: any;
    updatedAt: any;
}>;
//# sourceMappingURL=posSerial.service.d.ts.map