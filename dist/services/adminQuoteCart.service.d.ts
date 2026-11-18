export declare const QUOTE_CART_PAGE_SIZE = 4;
export declare const QUOTE_CART_MAX_LINES = 100;
export type StoredQuoteBranch = {
    branchId: number;
    label: string;
    stock: number;
};
export type StoredQuoteLine = {
    idProduct: number;
    name: string;
    description: string | null;
    caracteristicas: unknown;
    price: number;
    image_url: unknown;
    upc: string | null;
    sku: string | null;
    active: boolean;
    stock: number;
    stocksByBranch: StoredQuoteBranch[];
    quantity: number | null;
    manual?: boolean;
};
export type QuoteCartPage = {
    data: StoredQuoteLine[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    totalAmount: number;
};
export type ImportedQuoteRef = {
    quoteNumber: string;
    productIds: number[];
};
export declare function normalizeStoredQuoteLine(raw: unknown): StoredQuoteLine | null;
export declare function quoteCartTotal(lines: StoredQuoteLine[]): number;
export declare function sliceQuoteCart(lines: StoredQuoteLine[], requestedPage: number, viewAll?: boolean): QuoteCartPage;
export declare function upsertQuoteCartLine(lines: StoredQuoteLine[], incoming: StoredQuoteLine): {
    lines: StoredQuoteLine[];
    page: number;
} | {
    error: "full";
};
export declare function mergeQuoteCartLines(current: StoredQuoteLine[], incoming: StoredQuoteLine[]): {
    lines: StoredQuoteLine[];
    page: number;
} | {
    error: "full";
};
export declare function setQuoteCartQuantity(lines: StoredQuoteLine[], idProduct: number, quantity: number | null): StoredQuoteLine[] | null;
export declare function removeQuoteCartLine(lines: StoredQuoteLine[], idProduct: number): StoredQuoteLine[];
export type LiveQuoteUpdate = {
    idProduct: number;
    price?: number;
    stock?: number;
    active?: 0 | 1;
    branches?: Record<string, number>;
};
export declare function normalizeLiveQuoteUpdates(raw: unknown): LiveQuoteUpdate[];
export declare function applyLiveQuoteUpdates(lines: StoredQuoteLine[], updates: LiveQuoteUpdate[]): {
    lines: StoredQuoteLine[];
    changed: boolean;
};
export declare function readAdminQuoteCart(userId: number): Promise<StoredQuoteLine[]>;
export declare function stageAdminQuoteImport(userId: number, rawQuoteNumber: unknown, productIds: number[]): void;
export declare function forgetAdminQuoteImport(userId: number, rawQuoteNumber: unknown): void;
export declare function listAdminImportedQuoteNumbers(userId: number): string[];
export declare function writeAdminQuoteCart(userId: number, lines: StoredQuoteLine[]): Promise<void>;
//# sourceMappingURL=adminQuoteCart.service.d.ts.map