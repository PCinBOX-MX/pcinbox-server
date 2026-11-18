/** Proveedores con precio de compra + margen en `products_providers` (TechSmart, DicoTech). */
export declare const POS_COST_PROVIDER_IDS: readonly [2, 3];
/** Comisión de pagos en línea, sobre el importe cobrado de proveedores 2 y 3. */
export declare const POS_ONLINE_PAYMENT_FEE_RATE = 0.03;
export type PosUnitCost = {
    /** products_providers.price + 16% IVA */
    costUnit: number;
    /** products_providers.profitMargin */
    profitMarginUnit: number;
    /** products.price */
    catalogPriceUnit: number;
};
export type PosCostSummary = {
    /** Líneas de proveedores 2/3 con costo conocido. */
    lines: number;
    units: number;
    /** Σ (products_providers.price + IVA) × cantidad */
    investment: number;
    /** Cobrado − 3% de comisión − investment (puede ser negativa). */
    profitMargin: number;
    /** Σ importe cobrado (lineTotal) de esas líneas */
    totalCost: number;
};
export declare function isPosCostProvider(providerId: unknown): boolean;
/** Ids pedidos que son TechSmart o DicoTech, tengan o no fila de costo. */
export declare function loadPosCostProviderProductIds(productIds: number[]): Promise<Set<number>>;
/** Costos actuales por idProduct (solo proveedores 2/3 con fila en products_providers). */
export declare function loadPosUnitCostsByProductIds(productIds: number[]): Promise<Map<number, PosUnitCost>>;
export declare function summarizePosCosts(lines: Array<{
    quantity: number;
    costUnit: number | null;
    profitMarginUnit: number | null;
    lineTotal: number;
}>): PosCostSummary | null;
//# sourceMappingURL=posCost.service.d.ts.map