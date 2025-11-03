import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const registerSales: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPedidosByUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSalesByUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const historySalesByUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const filterSales: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=sales.controller.d.ts.map