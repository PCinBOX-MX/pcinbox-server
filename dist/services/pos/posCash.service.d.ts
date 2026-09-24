import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
export type CashMovementType = "cash_in" | "cash_out" | "sale_cash" | "sale_cash_void";
export declare function serializeCashMovement(m: any): {
    idCashMovement: number;
    type: any;
    amount: number;
    reason: any;
    posSaleId: number | null;
    userId: number;
    userName: string | null;
    createdAt: any;
};
export declare function serializeCashSession(session: any, expectedCash?: number, opts?: {
    movementsTotal?: number;
}): {
    idCashSession: number;
    branchId: number;
    branchName: any;
    branchCity: any;
    openedByUserId: number;
    openedByName: string | null;
    closedByUserId: number | null;
    closedByName: string | null;
    status: any;
    openingFloat: number;
    closingCounted: number | null;
    expectedCash: number | null;
    difference: number | null;
    differenceReason: any;
    notes: any;
    openedAt: any;
    closedAt: any;
    movementsTotal: any;
    movements: any;
};
/** Preview en modal: últimos N (más recientes primero). */
export declare const CASH_SESSION_MOVEMENTS_PREVIEW = 8;
/** Suma esperada en caja: fondo + entradas + ventas efectivo − salidas − voids. */
export declare function computeExpectedCash(tx: Prisma.TransactionClient | typeof prisma, cashSessionId: bigint | number): Promise<number>;
export declare function getOpenCashSession(branchId: number, tx?: Prisma.TransactionClient | typeof prisma): Promise<{
    status: import("@prisma/client").$Enums.pos_cash_session_status;
    branchId: bigint;
    notes: string | null;
    idCashSession: bigint;
    openedByUserId: bigint;
    closedByUserId: bigint | null;
    openingFloat: Prisma.Decimal;
    closingCounted: Prisma.Decimal | null;
    expectedCash: Prisma.Decimal | null;
    difference: Prisma.Decimal | null;
    differenceReason: string | null;
    openedAt: Date;
    closedAt: Date | null;
} | null>;
export declare function requireOpenCashSession(branchId: number, tx?: Prisma.TransactionClient | typeof prisma): Promise<{
    status: import("@prisma/client").$Enums.pos_cash_session_status;
    branchId: bigint;
    notes: string | null;
    idCashSession: bigint;
    openedByUserId: bigint;
    closedByUserId: bigint | null;
    openingFloat: Prisma.Decimal;
    closingCounted: Prisma.Decimal | null;
    expectedCash: Prisma.Decimal | null;
    difference: Prisma.Decimal | null;
    differenceReason: string | null;
    openedAt: Date;
    closedAt: Date | null;
}>;
export declare function openCashSession(params: {
    branchId: number;
    userId: number;
    openingFloat: number;
    notes?: string | null;
}): Promise<{
    alreadyOpen: boolean;
    idCashSession: number;
    branchId: number;
    branchName: any;
    branchCity: any;
    openedByUserId: number;
    openedByName: string | null;
    closedByUserId: number | null;
    closedByName: string | null;
    status: any;
    openingFloat: number;
    closingCounted: number | null;
    expectedCash: number | null;
    difference: number | null;
    differenceReason: any;
    notes: any;
    openedAt: any;
    closedAt: any;
    movementsTotal: any;
    movements: any;
}>;
export declare function addManualCashMovement(params: {
    branchId: number;
    userId: number;
    type: "cash_in" | "cash_out";
    amount: number;
    reason?: string | null;
}): Promise<{
    movement: {
        idCashMovement: number;
        type: import("@prisma/client").$Enums.pos_cash_movement_type;
        amount: number;
        reason: string | null;
        createdAt: Date;
    };
    session: {
        idCashSession: number;
        branchId: number;
        branchName: any;
        branchCity: any;
        openedByUserId: number;
        openedByName: string | null;
        closedByUserId: number | null;
        closedByName: string | null;
        status: any;
        openingFloat: number;
        closingCounted: number | null;
        expectedCash: number | null;
        difference: number | null;
        differenceReason: any;
        notes: any;
        openedAt: any;
        closedAt: any;
        movementsTotal: any;
        movements: any;
    };
}>;
export declare function closeCashSession(params: {
    branchId: number;
    userId: number;
    closingCounted: number;
    notes?: string | null;
    differenceReason?: string | null;
}): Promise<{
    idCashSession: number;
    branchId: number;
    branchName: any;
    branchCity: any;
    openedByUserId: number;
    openedByName: string | null;
    closedByUserId: number | null;
    closedByName: string | null;
    status: any;
    openingFloat: number;
    closingCounted: number | null;
    expectedCash: number | null;
    difference: number | null;
    differenceReason: any;
    notes: any;
    openedAt: any;
    closedAt: any;
    movementsTotal: any;
    movements: any;
}>;
export declare function getCashStatus(branchId: number): Promise<{
    open: boolean;
    session: null;
    expectedCash: null;
    paymentSummary: null;
} | {
    open: boolean;
    session: {
        idCashSession: number;
        branchId: number;
        branchName: any;
        branchCity: any;
        openedByUserId: number;
        openedByName: string | null;
        closedByUserId: number | null;
        closedByName: string | null;
        status: any;
        openingFloat: number;
        closingCounted: number | null;
        expectedCash: number | null;
        difference: number | null;
        differenceReason: any;
        notes: any;
        openedAt: any;
        closedAt: any;
        movementsTotal: any;
        movements: any;
    };
    expectedCash: number | null;
    paymentSummary: {
        salesCount: number;
        salesTotal: number;
        cancelledCount: number;
        byMethod: Record<string, number>;
    } | null;
}>;
export declare function listCashSessions(params: {
    branchId?: number | null;
    page?: number;
    limit?: number;
}): Promise<{
    data: {
        idCashSession: number;
        branchId: number;
        branchName: any;
        branchCity: any;
        openedByUserId: number;
        openedByName: string | null;
        closedByUserId: number | null;
        closedByName: string | null;
        status: any;
        openingFloat: number;
        closingCounted: number | null;
        expectedCash: number | null;
        difference: number | null;
        differenceReason: any;
        notes: any;
        openedAt: any;
        closedAt: any;
        movementsTotal: any;
        movements: any;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}>;
export declare function getCashSessionById(id: number): Promise<{
    idCashSession: number;
    branchId: number;
    branchName: any;
    branchCity: any;
    openedByUserId: number;
    openedByName: string | null;
    closedByUserId: number | null;
    closedByName: string | null;
    status: any;
    openingFloat: number;
    closingCounted: number | null;
    expectedCash: number | null;
    difference: number | null;
    differenceReason: any;
    notes: any;
    openedAt: any;
    closedAt: any;
    movementsTotal: any;
    movements: any;
} | null>;
export declare function listCashSessionMovements(params: {
    sessionId: number;
    page?: number;
    limit?: number;
}): Promise<{
    session: {
        idCashSession: number;
        branchId: number;
        branchName: any;
        branchCity: any;
        openedByUserId: number;
        openedByName: string | null;
        closedByUserId: number | null;
        closedByName: string | null;
        status: any;
        openingFloat: number;
        closingCounted: number | null;
        expectedCash: number | null;
        difference: number | null;
        differenceReason: any;
        notes: any;
        openedAt: any;
        closedAt: any;
        movementsTotal: any;
        movements: any;
    };
    data: {
        idCashMovement: number;
        type: any;
        amount: number;
        reason: any;
        posSaleId: number | null;
        userId: number;
        userName: string | null;
        createdAt: any;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
} | null>;
/** Registra efectivo de una venta completada dentro de una transacción. */
export declare function recordSaleCashInTx(tx: Prisma.TransactionClient, params: {
    branchId: number;
    userId: number;
    posSaleId: bigint | number;
    cashAmount: number;
}): Promise<bigint | null>;
/**
 * Revierte efectivo al cancelar.
 * - Si la sesión original sigue abierta → sale_cash_void ahí.
 * - Si ya cerró → ajusta en la caja abierta actual (obligatorio abrirla).
 * - Idempotente si ya existe void para la venta.
 */
export declare function recordSaleCashVoidInTx(tx: Prisma.TransactionClient, params: {
    branchId: number;
    userId: number;
    posSaleId: bigint | number;
    cashSessionId: bigint | number | null;
    cashAmount: number;
    folio?: string | null;
}): Promise<void>;
//# sourceMappingURL=posCash.service.d.ts.map