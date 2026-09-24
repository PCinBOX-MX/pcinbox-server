import { Request, Response } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
export declare const listPosBranches: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const searchPosProductsHandler: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Carga una cotización web por número para rellenar el carrito POS. */
export declare const getPosQuoteByNumber: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const searchPosCustomers: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createPosSale: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listPosSales: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosSaleById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const cancelPosSale: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosSaleTicket: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Hoja de garantía printable (estilo Dicotech). */
export declare const getPosSaleWarrantySheet: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosCashStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const openPosCash: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addPosCashMovement: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const closePosCash: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listPosCashSessions: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosCashSessionById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listPosCashSessionMovements: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Ledger unificado web + POS (Fase 4). */
export declare const listInventoryMovements: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const searchPosSerials: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPosSerial: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const markPosSerialRma: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const registerPosSerial: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updatePosProductSerialConfig: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=pos.controller.d.ts.map