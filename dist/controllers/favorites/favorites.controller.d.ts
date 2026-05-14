import { Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const getFavoritosUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const addFavorites: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeFavorites: (req: CustomRequestI, rest: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getTotalFavorites: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=favorites.controller.d.ts.map