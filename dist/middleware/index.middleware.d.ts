import { NextFunction, Response } from "express";
import "../config/loadEnv";
import CustomRequestI from "../interfaces/customrequest.interface";
export declare const MiddleAuthRoute: (req: CustomRequestI, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=index.middleware.d.ts.map