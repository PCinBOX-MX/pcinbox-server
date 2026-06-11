import { Response, Request } from "express";
import CustomRequestI from "../../interfaces/customrequest.interface";
export declare const createReservation: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const cancelReservation: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const rescheduleReservation: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserReservations: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const checkAvailability: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getReservationByReference: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getReservationByRef: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAdminReservations: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateReservationStatus: (req: CustomRequestI, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=reservas.controller.d.ts.map