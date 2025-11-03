export declare const hasPassword: (password: string) => Promise<string>;
export declare const verifyPassword: (password: string, hashed: string) => Promise<boolean>;
export declare const signPayload: (obj: object | Buffer | string, expiresIn: number | any) => string;
export declare function generateResetToken(): string;
export declare const writeErrorLogs: (error: any) => void;
export declare function parseBigInts(obj: any): any;
export declare const formatter: Intl.NumberFormat;
//# sourceMappingURL=index.service.d.ts.map