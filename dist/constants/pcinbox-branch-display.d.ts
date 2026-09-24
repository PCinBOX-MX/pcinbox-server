/**
 * Etiquetas de bodega PCinBOX alineadas con pcinbox-client
 * (`getBranchDisplayName` / gridConfirmaProductos).
 */
export declare const PCINBOX_PROVIDER_ID = 1;
export declare const TECHSMART_PROVIDER_ID = 2;
export declare const DICOTECH_PROVIDER_ID = 3;
export declare function normalizePosBranchKey(rawName?: string | null): string;
export declare function isPosSellableBranchName(providerId: number, branchName?: string | null): boolean;
export declare function formatPcinboxBranchDisplayName(rawName?: string | null | undefined): string | null;
/** Fallback de ticket cuando no hay bodega en la línea (p. ej. manual / stock global). */
export declare const POS_TICKET_BRANCH_FALLBACK = "PCinBOX-Le\u00F3n";
export declare function resolveTicketBranchLabel(params: {
    itemBranchName?: string | null | undefined;
    saleBranchName?: string | null | undefined;
}): string;
//# sourceMappingURL=pcinbox-branch-display.d.ts.map