/** true si `products.requiresSerial` / `warrantyMonths` ya existen en MySQL. */
export declare function productsHaveSerialColumns(): Promise<boolean>;
export declare function getProductSerialFlags(productId: number): Promise<{
    requiresSerial: boolean;
    /** null = sin plazo fijo. */
    warrantyMonths: number | null;
    warrantyMode: string | null;
    isPC: boolean;
    providerId: number | null;
}>;
//# sourceMappingURL=posSerialFlags.service.d.ts.map