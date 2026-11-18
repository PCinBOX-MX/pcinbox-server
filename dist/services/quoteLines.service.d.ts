export type StoredQuoteLine = {
    productId: string;
    quantity: number;
    storeId: number | null;
    unitPrice?: number | null;
    /** Producto capturado sin catálogo. El precio cobrable vive en el PDF. */
    manual?: boolean;
    name?: string;
    upc?: string | null;
};
export type StoredQuoteDelivery = {
    street: string;
    noExt: string;
    noInt: string | null;
    postalCode: string;
    cologne: string;
    city: string;
    state: string;
    country: string;
    shippingCost: number;
};
export type QuoteLinesPayload = {
    lines: StoredQuoteLine[];
    importedAt: string | null;
    importedByUserId: number | null;
    /** Equipos iguales. 1 en cotizaciones guardadas antes de este dato. */
    equipmentCount: number;
    /** Precio de ensamble de un equipo. Null si no se cobró. */
    assemblyPrice: number | null;
    /** Domicilios de envío. Vacío si la cotización no los trae. */
    deliveries: StoredQuoteDelivery[];
    /** Notas del PDF. Vacío si no hubo comentarios. */
    comments: string;
};
/** Lo que puede verse en el PDF: sin calle ni número. */
export declare function quotePublicShippingLabel(row: {
    postalCode: string;
    cologne: string;
    city: string;
    state: string;
}): string;
export declare function normalizeEquipmentCount(raw: unknown): number;
export declare const QUOTE_NUMBER_PATTERN: RegExp;
export declare function normalizeQuoteNumber(raw: unknown): string;
/** Vacío si no hay. Null si el valor guardado no es usable. */
export declare function parseQuoteComments(raw: unknown): string | null;
/**
 * Lee linesJson: array legacy o `{ lines, equipmentCount?, importedAt?, importedByUserId? }`.
 * POS / checkout siguen usando solo las líneas vía `parseStoredQuoteLines`.
 */
export declare function readStoredQuoteLinesPayload(raw: unknown): QuoteLinesPayload | null;
/** Parsea linesJson de cotizaciones (checkoutContext / POS). */
export declare function parseStoredQuoteLines(raw: unknown): StoredQuoteLine[] | null;
/** Marca linesJson como ya importada (sin columnas nuevas). */
export declare function buildImportedLinesJson(lines: StoredQuoteLine[], userId: number, equipmentCount?: number, assemblyPrice?: number | null, deliveries?: StoredQuoteDelivery[], comments?: string): {
    lines: StoredQuoteLine[];
    importedAt: string;
    importedByUserId: number;
    equipmentCount?: number;
    assemblyPrice?: number;
    deliveries?: StoredQuoteDelivery[];
    comments?: string;
};
/** Null si el arreglo trae un domicilio incompleto. Vacío si no hay envíos. */
export declare function parseQuoteDeliveries(raw: unknown): StoredQuoteDelivery[] | null;
//# sourceMappingURL=quoteLines.service.d.ts.map