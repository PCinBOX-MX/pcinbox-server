export declare function normalizeStoreId(storeId: unknown): number | null;
export declare function getOrCreateActiveCart(userId: number): Promise<{
    createdAt: Date | null;
    status: import("@prisma/client").$Enums.carts_status | null;
    userId: bigint;
    idCart: bigint;
}>;
/**
 * Mueve ítems activos huérfanos (en carritos no activos del mismo usuario)
 * al carrito activo para que getCart y addProduct vean lo mismo.
 */
export declare function consolidateActiveCartItems(userId: number, activeCartId: bigint): Promise<void>;
export declare function findActiveCartItem(carId: bigint, productId: number, storeId: number | null): Promise<{
    active: number | null;
    idCartItem: bigint;
    carId: bigint;
    productId: bigint;
    storeId: number | null;
    quantity: number | null;
} | null | undefined>;
/**
 * Une líneas duplicadas del mismo producto (p. ej. storeId null vs sucursal)
 * para que addProduct y getCart vean la misma cantidad.
 */
export declare function mergeDuplicateCartLines(carId: bigint, productId: number, preferredStoreId: number | null): Promise<{
    active: number | null;
    idCartItem: bigint;
    carId: bigint;
    productId: bigint;
    storeId: number | null;
    quantity: number | null;
} | null>;
export declare function deactivateAllActiveCartItems(carId: bigint): Promise<import("@prisma/client").Prisma.BatchPayload>;
export declare function resolveAvailableStock(productId: number, storeId: number | null): Promise<{
    stock: number;
    found: boolean;
}>;
//# sourceMappingURL=cart.service.d.ts.map