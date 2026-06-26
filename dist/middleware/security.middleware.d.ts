import { Express, NextFunction, Request, Response } from "express";
import { HttpRateLimiter } from "../utils/http-rate-limiter.util";
export declare const globalRateLimiter: HttpRateLimiter;
export declare const authRateLimiter: HttpRateLimiter;
export declare const strictRateLimiter: HttpRateLimiter;
export declare function applySecurityBaseline(app: Express): void;
export declare function blockMaliciousProbePaths(req: Request, res: Response, next: NextFunction): void;
export declare const authPathRateLimiter: (req: Request, res: Response, next: NextFunction) => void;
export declare const checkoutPathRateLimiter: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=security.middleware.d.ts.map