import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const hasAddressUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const registerAddress: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeAddress: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updatedAddress: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=address.controller.d.ts.map