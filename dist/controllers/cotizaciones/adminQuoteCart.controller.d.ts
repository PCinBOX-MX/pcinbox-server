import { Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
export declare const getAdminQuoteCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const replaceAdminQuoteCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const mergeAdminQuoteCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addAdminQuoteCartLine: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateAdminQuoteCartQuantity: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeAdminQuoteCartLine: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const syncAdminQuoteCartLive: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const clearAdminQuoteCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=adminQuoteCart.controller.d.ts.map