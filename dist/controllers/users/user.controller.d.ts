import { Request, Response } from "express";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const Login: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const Register: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const LoginGoogle: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const uploadPhoto: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPhotoUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const ChangePassword: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const removeAccount: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=user.controller.d.ts.map