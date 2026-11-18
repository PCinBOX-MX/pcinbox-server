import { Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
import { type StoredQuoteDelivery } from "../../services/quoteLines.service";
type CheckoutMode = "cart" | "buy_now";
type CheckoutLine = {
    productId: string;
    quantity: number;
    storeId: number | null;
    /** Opcional en request; no se persiste (precios van en Keywords del PDF). */
    unitPrice: number | null;
    manual?: boolean;
    name?: string;
    upc?: string | null;
};
export declare const parseCheckoutContext: (raw: unknown, itemCount: number) => {
    mode: CheckoutMode;
    lines: CheckoutLine[];
    cartHash: string;
    equipmentCount: number;
    assemblyPrice: number | null;
    deliveries: StoredQuoteDelivery[];
    comments: string;
} | null;
export declare const quotaResponse: (count: number, oldestCreatedAt: Date) => {
    limit: number;
    remaining: number;
    resetAt: Date;
};
export declare const createQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createAdminQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
type QuoteBranchRow = {
    idBranche: bigint;
    name: string | null;
    city: string | null;
    providerId: bigint;
};
export declare function buildQuoteStocksByBranch(providerId: number, branches: QuoteBranchRow[], stockByBranch: Map<string, number>): {
    branchId: number;
    label: string;
    stock: number;
}[];
export declare const searchAdminQuoteProducts: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAdminQuoteImport: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const markAdminQuoteImported: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const unlinkAdminQuoteImport: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAdminQuoteProductAvailability: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listAdminQuotes: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Inversión, margen y costo cobrado. No se imprime en el PDF. */
export declare const getAdminQuoteCostSummary: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const streamAdminQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const archiveAdminQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export {};
//# sourceMappingURL=cotizaciones.controller.d.ts.map