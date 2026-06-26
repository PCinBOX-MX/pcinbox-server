import { NextFunction, Request, Response } from "express";
export declare function resolveClientIp(req: Request): string;
export declare class HttpRateLimiter {
    private readonly maxRequests;
    private readonly windowMs;
    private readonly name;
    private readonly buckets;
    constructor(maxRequests: number, windowMs: number, name: string);
    middleware: (req: Request, res: Response, next: NextFunction) => void;
}
export declare function createPathPrefixRateLimiter(prefixes: string[], limiter: HttpRateLimiter): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=http-rate-limiter.util.d.ts.map