import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const getCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addProduct: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addProductFromStorage: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeProduct: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeAllCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const generateCotizacion: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=cart.controller.d.ts.map