import { Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
type CheckoutMode = "cart" | "buy_now";
type CheckoutLine = {
    productId: string;
    quantity: number;
    storeId: number | null;
};
export declare const parseCheckoutContext: (raw: unknown, itemCount: number) => {
    mode: CheckoutMode;
    lines: CheckoutLine[];
    cartHash: string;
} | null;
export declare const quotaResponse: (count: number, oldestCreatedAt: Date) => {
    limit: number;
    remaining: number;
    resetAt: Date;
};
export declare const createQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listAdminQuotes: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const streamAdminQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const archiveAdminQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export {};
//# sourceMappingURL=cotizaciones.controller.d.ts.map