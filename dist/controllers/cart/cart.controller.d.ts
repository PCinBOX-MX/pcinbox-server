import { Response } from "express";
import "../../config/loadEnv";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const getCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addProduct: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addProductFromStorage: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeProduct: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeAllCart: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const generateCotizacion: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const changeSucursal: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const changeQuantity: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
/**
 * Importa líneas de una cotización web al carrito del usuario autenticado (merge).
 * Disponible para cualquier usuario logueado.
 * Tras un import exitoso marca linesJson.importedAt (sin columnas nuevas).
 */
export declare const importFromQuote: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=cart.controller.d.ts.map