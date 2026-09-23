import { Request, Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
export declare const listPosBranches: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const searchPosProductsHandler: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const searchPosCustomers: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createPosSale: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listPosSales: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosSaleById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const cancelPosSale: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Confirma pago de venta pending_payment (p.ej. OpenPay ya cobrado) y descuenta stock. */
export declare const confirmPosPayment: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Regenera link OpenPay para una venta pending_payment. */
export declare const retryPosPaymentLink: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosSaleTicket: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=pos.controller.d.ts.map