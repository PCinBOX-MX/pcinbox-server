import { Prisma } from "@prisma/client";
/**
 * Completa una venta POS en pending_payment.
 * El stock ya se reservó al crear el pending (OpenPay); aquí solo se confirma estado + series.
 */
export declare function completePendingPosSale(params: {
    idPosSale?: number | null;
    idLinkPago?: number | null;
    linkReferencia?: string | null;
    userId?: number | null;
    note?: string | null;
    source?: "manual" | "openpay_webhook";
}): Promise<{
    sale: {
        items: {
            productId: bigint;
            quantity: number;
            branchId: bigint | null;
            productName: string;
            idPosSaleItem: bigint;
            posSaleId: bigint;
            productSku: string | null;
            productUpc: string | null;
            unitPrice: Prisma.Decimal;
            discountPct: Prisma.Decimal;
            lineTotal: Prisma.Decimal;
        }[];
        events: {
            createdAt: Date;
            userId: bigint | null;
            reason: string | null;
            posSaleId: bigint;
            idPosSaleEvent: bigint;
            eventType: string;
            payload: Prisma.JsonValue | null;
        }[];
    } & {
        createdAt: Date;
        status: import("@prisma/client").$Enums.pos_sales_status;
        branchId: bigint;
        total: Prisma.Decimal;
        updatedAt: Date;
        cancelReason: string | null;
        requiredFactura: number;
        customerName: string | null;
        quoteNumber: string | null;
        idempotencyKey: string | null;
        customerUserId: bigint | null;
        notes: string | null;
        idPosSale: bigint;
        folio: string;
        cashierUserId: bigint;
        subtotal: Prisma.Decimal;
        discountTotal: Prisma.Decimal;
        cancelledAt: Date | null;
        cancelledByUserId: bigint | null;
        customerEmail: string | null;
        customerPhone: string | null;
        paymentLinkUrl: string | null;
        checkoutLinkUrl: string | null;
        linkReferencia: string | null;
        idLinkPago: number | null;
        cashSessionId: bigint | null;
    };
    alreadyCompleted: true;
} | {
    sale: {
        branches: {
            name: string | null;
            city: string | null;
        };
        customer: {
            name: string;
            lastname: string | null;
            email: string;
        } | null;
        cashier: {
            name: string;
            lastname: string | null;
        };
        items: ({
            branches: {
                name: string | null;
                city: string | null;
            } | null;
            serials: {
                warrantyMonths: number | null;
                status: import("@prisma/client").$Enums.product_serial_status;
                idProductSerial: bigint;
                serialNumber: string;
                warrantyExpiresAt: Date | null;
            }[];
        } & {
            productId: bigint;
            quantity: number;
            branchId: bigint | null;
            productName: string;
            idPosSaleItem: bigint;
            posSaleId: bigint;
            productSku: string | null;
            productUpc: string | null;
            unitPrice: Prisma.Decimal;
            discountPct: Prisma.Decimal;
            lineTotal: Prisma.Decimal;
        })[];
        payments: {
            createdAt: Date;
            reference: string | null;
            method: import("@prisma/client").$Enums.pos_payment_method;
            posSaleId: bigint;
            amount: Prisma.Decimal;
            idPosPayment: bigint;
        }[];
        events: {
            createdAt: Date;
            userId: bigint | null;
            reason: string | null;
            posSaleId: bigint;
            idPosSaleEvent: bigint;
            eventType: string;
            payload: Prisma.JsonValue | null;
        }[];
    } & {
        createdAt: Date;
        status: import("@prisma/client").$Enums.pos_sales_status;
        branchId: bigint;
        total: Prisma.Decimal;
        updatedAt: Date;
        cancelReason: string | null;
        requiredFactura: number;
        customerName: string | null;
        quoteNumber: string | null;
        idempotencyKey: string | null;
        customerUserId: bigint | null;
        notes: string | null;
        idPosSale: bigint;
        folio: string;
        cashierUserId: bigint;
        subtotal: Prisma.Decimal;
        discountTotal: Prisma.Decimal;
        cancelledAt: Date | null;
        cancelledByUserId: bigint | null;
        customerEmail: string | null;
        customerPhone: string | null;
        paymentLinkUrl: string | null;
        checkoutLinkUrl: string | null;
        linkReferencia: string | null;
        idLinkPago: number | null;
        cashSessionId: bigint | null;
    };
    alreadyCompleted: false;
}>;
//# sourceMappingURL=posComplete.service.d.ts.map