import Redis from "ioredis";
export declare function isRedisConfigured(): boolean;
export declare function getRedisKeyPrefix(): string;
export declare function getRedisClient(): Redis | null;
export declare function ensureRedisConnected(): Promise<Redis | null>;
export declare function redisPing(): Promise<boolean>;
export declare function closeRedisClient(): Promise<void>;
//# sourceMappingURL=redis.client.d.ts.map