/**
 * Resolución de garantía POS por proveedor / isPC / catálogo / cajero.
 * Modes: months | none | service_center
 */
export type WarrantyMode = "months" | "none" | "service_center";
export type ResolvedWarranty = {
    warrantyMode: WarrantyMode | null;
    warrantyMonths: number | null;
};
export declare function parseWarrantyMode(raw: unknown): WarrantyMode | null;
export declare function fromCatalogWarranty(mode: unknown, months: unknown): ResolvedWarranty;
/**
 * Normaliza elección del cajero (solo componentes PCinBOX).
 * clientUnit: "months" | "years" cuando mode es months.
 */
export declare function fromCashierWarranty(input: {
    warrantyMode?: unknown;
    warrantyMonths?: unknown;
    warrantyUnit?: unknown;
}): ResolvedWarranty;
/**
 * Reglas:
 * - TechSmart (2) → 12 meses fijo
 * - PCinBOX (1) + isPC → 12 meses fijo
 * - PCinBOX (1) + !isPC → cajero (obligatorio)
 * - Resto (DicoTech, etc.) → catálogo
 */
export declare function resolvePosLineWarranty(params: {
    providerId: number | null | undefined;
    isPC: boolean;
    catalogMode?: unknown;
    catalogMonths?: unknown;
    clientMode?: unknown;
    clientMonths?: unknown;
    clientUnit?: unknown;
    /** Si true y es componente PCinBOX sin elección → error */
    requireCashierChoice?: boolean;
}): ResolvedWarranty;
export declare function warrantyCoverageLabel(mode: unknown, months: unknown): string;
/** ¿El cajero debe elegir garantía en cobro? */
export declare function posWarrantySelectable(params: {
    providerId?: number | null;
    isPC?: boolean | number | null;
}): boolean;
//# sourceMappingURL=posWarranty.service.d.ts.map