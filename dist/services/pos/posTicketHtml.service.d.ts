type TicketSale = {
    folio: string;
    status: string;
    createdAt: string;
    branchName?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    notes?: string | null;
    cancelReason?: string | null;
    quoteNumber?: string | null;
    subtotal: number;
    discountTotal: number;
    total: number;
    deliveryAddresses?: Array<{
        postalCode?: string | null;
        shippingCost?: number | null;
    }> | null;
    deliveryAddress?: {
        postalCode?: string | null;
        shippingCost?: number | null;
    } | null;
    items: Array<{
        productId: number;
        productName: string;
        productSku: string | null;
        productUpc: string | null;
        branchName?: string | null;
        branchLabel?: string | null;
        branchCity?: string | null;
        providerId?: number | null;
        quantity: number;
        unitPrice: number;
        discountPct: number;
        lineTotal: number;
        serials?: Array<{
            serialNumber: string;
        }>;
        serviceIntake?: {
            serviceType?: string;
            equipment?: Array<{
                quantity: number;
                description: string;
                serialNumber: string;
                physicalCondition: string;
            }>;
            failureOrRequestedService?: string;
            technicalObservationsOnReceipt?: string;
        } | null;
    }>;
    payments: Array<{
        method: string;
        amount: number;
        reference: string | null;
    }>;
};
export declare function buildPosSaleTicketHtml(data: TicketSale): string;
export {};
//# sourceMappingURL=posTicketHtml.service.d.ts.map