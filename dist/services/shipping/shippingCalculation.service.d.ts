export declare const ESTAFETA_FIXED_COST = 178;
export declare const PAQUETE_EXPRESS_TARIFAS: readonly [{
    readonly max: 5;
    readonly price: 303;
}, {
    readonly max: 10;
    readonly price: 329;
}, {
    readonly max: 15;
    readonly price: 396;
}];
export type ShippingProductInput = {
    idProduct?: string | number;
    price?: string | number;
    quantity?: string | number;
    providerId?: string | number;
    width?: number | string | null;
    height?: number | string | null;
    largo?: number | string | null;
    storeId?: number | string | null;
    name?: string;
    stock?: number | string | null;
};
export type DeliverySelectionInput = {
    shipping_method: string;
    idAddress?: number | null;
    wantsInsurance?: "si" | "no" | string | null;
};
export type CalculatedGroupCosts = {
    shippingCost: number;
    insuranceCost: number;
    totalExtra: number;
    error?: string;
};
export declare function calcInsuranceCost(subtotal: number): number;
export declare function calcVolumetricShipping(volumenCm3: number): {
    tarifa: {
        readonly max: 5;
        readonly price: 303;
    } | {
        readonly max: 10;
        readonly price: 329;
    } | {
        readonly max: 15;
        readonly price: 396;
    } | null;
    pesoVolumetrico: number;
    excede: boolean;
    price: number;
};
export declare function sumProductVolume(products: ShippingProductInput[]): number;
export declare function sumProviderSubtotal(products: ShippingProductInput[], providerId: number): number;
export declare function sumGroupSubtotal(products: ShippingProductInput[]): number;
export declare function getZoneShippingCost(idAddress: number | null | undefined, userId?: number): Promise<number>;
export declare function calculateGroupCosts(products: ShippingProductInput[], selection: DeliverySelectionInput): Promise<CalculatedGroupCosts>;
export declare function buildDataPurchaseFromSelections(groupedProducts: Record<string, {
    products: ShippingProductInput[];
    selection: DeliverySelectionInput;
}>): Promise<Record<string, any>>;
export declare function calculateProductsSubtotal(products: ShippingProductInput[]): number;
export declare function calculateExtrasTotal(dataPurchase: Record<string, {
    costoEnvioProductByZone?: number;
    costoSeguroEnvio?: number;
}>): number;
export declare function validateProductPrices(products: ShippingProductInput[]): Promise<{
    ok: boolean;
    message?: string;
}>;
//# sourceMappingURL=shippingCalculation.service.d.ts.map