import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const getBillingByUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listBilling: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createBilling: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateBilling: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeBilling: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=billing.controller.d.ts.map