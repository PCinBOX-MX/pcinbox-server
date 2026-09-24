import { Request } from "express";
export default interface CustomRequestI extends Request {
    idUser?: any;
    /** Rol POS resuelto por MiddlePosRoute (`admin` | `support`). */
    posRole?: "admin" | "support";
}
//# sourceMappingURL=customrequest.interface.d.ts.map