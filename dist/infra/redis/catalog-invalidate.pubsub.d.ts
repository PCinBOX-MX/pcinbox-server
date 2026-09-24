export type CatalogInvalidatePayload = {
    productId?: number;
    reason?: string;
    source?: string;
};
/** Canal sin keyPrefix de servicio — compartido entre backends del mismo entorno. */
export declare function getCatalogInvalidateChannel(): string;
export declare function publishCatalogInvalidation(payload?: CatalogInvalidatePayload): Promise<boolean>;
export declare function startCatalogInvalidationSubscriber(onMessage: (payload: CatalogInvalidatePayload) => void | Promise<void>): Promise<void>;
export declare function stopCatalogInvalidationSubscriber(): Promise<void>;
//# sourceMappingURL=catalog-invalidate.pubsub.d.ts.map