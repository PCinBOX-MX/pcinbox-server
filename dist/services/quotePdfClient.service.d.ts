export type QuotePdfClientIdentity = {
    name: string | null;
    email: string | null;
    phone: string | null;
    /** true cuando el bloque Cliente es "Venta público general" o está vacío */
    isPublicSale: boolean;
};
export type QuotePdfLinePrice = {
    productId: string;
    quantity: number;
    unitPrice: number;
};
export type QuotePdfManualLine = {
    productId: string;
    quantity: number;
    unitPrice: number;
    name: string;
    upc: string | null;
};
export type QuotePdfShipping = {
    shippingCost: number;
    label: string;
};
export type QuotePdfSaleExtras = {
    manualById: Map<string, QuotePdfManualLine>;
    assemblyPrice: number | null;
    shipping: QuotePdfShipping[];
};
/** Parsea el string Keywords embebido (con o sin prefijo visible). */
export declare const parseClientKeywordsString: (keywords: string | null | undefined) => QuotePdfClientIdentity | null;
/** Lee el string crudo de /Keywords del PDF (literal, hex u objeto indirecto). */
export declare const extractPdfKeywordsString: (pdfBytes: Buffer) => string | null;
/**
 * Precios unitarios embebidos: pcinbox-lines-v1|id:qty:price;id:qty:price
 * (números sin $ ni comas).
 */
export declare const parseLinesKeywordsString: (keywords: string | null | undefined) => QuotePdfLinePrice[] | null;
/**
 * Productos sin catálogo: pcinbox-manual-v1|id:qty:price:nombreB64:upcB64
 * El nombre y el UPC van en base64url para no romper el separador.
 */
export declare const parseManualKeywordsString: (keywords: string | null | undefined) => QuotePdfManualLine[];
/** Precio de ensamble de un equipo: pcinbox-assembly-v1|50.00 */
export declare const parseAssemblyKeywordString: (keywords: string | null | undefined) => number | null;
/** Envíos: pcinbox-shipping-v1|costo:etiquetaB64;costo:etiquetaB64 */
export declare const parseShippingKeywordString: (keywords: string | null | undefined) => QuotePdfShipping[];
/** Lee Keywords del Info dict del PDF (metadatos embebidos al generar). */
export declare const parseClientFromPdfKeywords: (pdfBytes: Buffer) => QuotePdfClientIdentity | null;
export declare const parseLinesFromPdfKeywords: (pdfBytes: Buffer) => QuotePdfLinePrice[] | null;
/** productId → unitPrice desde Keywords del PDF de cotización. */
export declare const readQuotePdfLinePrices: (storageKey: string) => Promise<Map<number, number>>;
/** Precios de productos sin catálogo y de ensamble, leídos del PDF. */
export declare const readQuotePdfSaleExtras: (storageKey: string) => Promise<QuotePdfSaleExtras>;
export declare const parseQuotePdfClientFromText: (textOrTokens: string | string[]) => QuotePdfClientIdentity;
/**
 * Lee solo Keywords del PDF (rápido; sin pdf-parse).
 * Devuelve null si el PDF no trae metadatos pcinbox-client-v1.
 */
export declare const readQuotePdfClientIdentityLight: (storageKey: string) => Promise<QuotePdfClientIdentity | null>;
/**
 * Lee el PDF de una cotización y obtiene el bloque Cliente.
 * Prioridad: Keywords (binario / pdf-parse info) → texto (pdf-parse) → vacío.
 */
export declare const readQuotePdfClientIdentity: (storageKey: string) => Promise<QuotePdfClientIdentity>;
/**
 * Resuelve customer a partir del PDF (sin mezclar con users de la cuenta).
 *
 * - Solo nombre → solo nombre (phone/email null).
 * - Solo teléfono → solo teléfono.
 * - Ambos → ambos (email solo si viene en el PDF).
 * - Público / vacío → nulls (el caller decide caer a la cuenta).
 *
 * `accountPhone` se ignora (firmas legacy); no rellenar huecos con users.phone.
 */
export declare const resolvePosCustomerFromPdf: (pdfClient: QuotePdfClientIdentity, _accountPhone?: string | null) => {
    name: string | null;
    email: string | null;
    phone: string | null;
};
//# sourceMappingURL=quotePdfClient.service.d.ts.map