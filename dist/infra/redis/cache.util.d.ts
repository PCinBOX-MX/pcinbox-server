export declare function cacheGetJson<T>(key: string): Promise<T | null>;
export declare function cacheSetJson(key: string, value: unknown, ttlSec?: number): Promise<void>;
export declare function cacheDel(key: string): Promise<void>;
export declare function cacheDelByPrefix(prefix: string): Promise<void>;
export declare function cacheSetNx(key: string, value: string, ttlSec: number): Promise<boolean>;
//# sourceMappingURL=cache.util.d.ts.map