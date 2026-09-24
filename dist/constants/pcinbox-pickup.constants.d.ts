/** Sucursal física donde el cliente recoge (PCinBOX-León), distinta de la sucursal de compra/stock. */
export declare const PCINBOX_PICKUP_BRANCH_NAME = "leon2";
/** Provider id de catálogo propio PCinBOX. */
export declare const PCINBOX_PROVIDER_ID = 1;
export declare function resolvePcinboxPickupBranchId(): Promise<number | null>;
/**
 * Sucursal de caja POS (fija, no se elige en UI).
 * 1) Primera branch con `providerId = 1` (catálogo PCinBOX).
 * 2) Si no existe en BD (caso actual: no hay branches con provider 1),
 *    usa la sucursal de recolección `leon2` (tienda física PCinBOX-León).
 */
export declare function resolvePosCashBranchId(): Promise<number | null>;
export declare function isPickupShippingMethod(method?: string | null): boolean;
//# sourceMappingURL=pcinbox-pickup.constants.d.ts.map