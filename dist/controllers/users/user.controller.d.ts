import { Request, Response } from "express";
import "../../config/loadEnv";
import CustomRequestI from "./../../interfaces/customrequest.interface";
export declare const Login: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/**
 * Paso 1 del registro: valida datos, NO crea la cuenta, envía código al correo.
 * (Reemplaza la creación directa anterior.)
 */
export declare const Register: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const ResendRegisterCode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/** Paso 2: valida el código y crea la cuenta. */
export declare const ConfirmRegister: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const LoginGoogle: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getPhone: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const dismissPhonePrompt: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updatePhone: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const uploadPhoto: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPhotoUser: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const ChangePassword: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deletePhoto: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const removeAccount: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=user.controller.d.ts.map