"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CASH_SESSION_MOVEMENTS_PREVIEW = void 0;
exports.serializeCashMovement = serializeCashMovement;
exports.serializeCashSession = serializeCashSession;
exports.computeExpectedCash = computeExpectedCash;
exports.getOpenCashSession = getOpenCashSession;
exports.requireOpenCashSession = requireOpenCashSession;
exports.openCashSession = openCashSession;
exports.addManualCashMovement = addManualCashMovement;
exports.closeCashSession = closeCashSession;
exports.getCashStatus = getCashStatus;
exports.listCashSessions = listCashSessions;
exports.getCashSessionById = getCashSessionById;
exports.listCashSessionMovements = listCashSessionMovements;
exports.recordSaleCashInTx = recordSaleCashInTx;
exports.recordSaleCashVoidInTx = recordSaleCashVoidInTx;
const client_1 = require("@prisma/client");
const prismaClient_1 = require("../../db/prismaClient");
const pos_service_1 = require("./pos.service");
const MAX_CASH_AMOUNT = 9_999_999.99;
const DIFF_EPS = 0.009;
function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v))
        return NaN;
    return (0, pos_service_1.roundMoney)(v);
}
function assertCashAmount(amount, label = "Monto") {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`${label} inválido`);
    }
    if (amount > MAX_CASH_AMOUNT) {
        throw new Error(`${label} excede el máximo permitido`);
    }
}
function serializeCashMovement(m) {
    return {
        idCashMovement: Number(m.idCashMovement),
        type: m.type,
        amount: Number(m.amount),
        reason: m.reason,
        posSaleId: m.posSaleId != null ? Number(m.posSaleId) : null,
        userId: Number(m.userId),
        userName: m.users
            ? `${m.users.name || ""} ${m.users.lastname || ""}`.trim()
            : null,
        createdAt: m.createdAt,
    };
}
function serializeCashSession(session, expectedCash, opts) {
    const expected = expectedCash != null
        ? expectedCash
        : session.expectedCash != null
            ? Number(session.expectedCash)
            : null;
    const movementsTotal = opts?.movementsTotal != null
        ? opts.movementsTotal
        : session._count?.movements != null
            ? Number(session._count.movements)
            : Array.isArray(session.movements)
                ? session.movements.length
                : 0;
    return {
        idCashSession: Number(session.idCashSession),
        branchId: Number(session.branchId),
        branchName: session.branches?.name || null,
        branchCity: session.branches?.city || null,
        openedByUserId: Number(session.openedByUserId),
        openedByName: session.openedBy
            ? `${session.openedBy.name || ""} ${session.openedBy.lastname || ""}`.trim()
            : null,
        closedByUserId: session.closedByUserId
            ? Number(session.closedByUserId)
            : null,
        closedByName: session.closedBy
            ? `${session.closedBy.name || ""} ${session.closedBy.lastname || ""}`.trim()
            : null,
        status: session.status,
        openingFloat: Number(session.openingFloat),
        closingCounted: session.closingCounted != null ? Number(session.closingCounted) : null,
        expectedCash: expected,
        difference: session.difference != null ? Number(session.difference) : null,
        differenceReason: session.differenceReason || null,
        notes: session.notes || null,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        movementsTotal,
        movements: (session.movements || []).map(serializeCashMovement),
    };
}
const sessionMetaInclude = {
    branches: { select: { name: true, city: true } },
    openedBy: { select: { name: true, lastname: true } },
    closedBy: { select: { name: true, lastname: true } },
};
const movementUserInclude = {
    users: { select: { name: true, lastname: true } },
};
/** Preview en modal: últimos N (más recientes primero). */
exports.CASH_SESSION_MOVEMENTS_PREVIEW = 8;
const sessionInclude = {
    ...sessionMetaInclude,
    movements: {
        orderBy: { createdAt: "desc" },
        take: exports.CASH_SESSION_MOVEMENTS_PREVIEW,
        include: movementUserInclude,
    },
    _count: { select: { movements: true } },
};
/** Suma esperada en caja: fondo + entradas + ventas efectivo − salidas − voids. */
async function computeExpectedCash(tx, cashSessionId) {
    const session = await tx.pos_cash_sessions.findFirst({
        where: { idCashSession: cashSessionId },
        select: { openingFloat: true },
    });
    if (!session)
        throw new Error("Sesión de caja no encontrada");
    const grouped = await tx.pos_cash_movements.groupBy({
        by: ["type"],
        where: { cashSessionId },
        _sum: { amount: true },
    });
    let expected = Number(session.openingFloat);
    for (const row of grouped) {
        const amt = Number(row._sum.amount || 0);
        if (row.type === "cash_in" || row.type === "sale_cash")
            expected += amt;
        else if (row.type === "cash_out" || row.type === "sale_cash_void")
            expected -= amt;
    }
    return (0, pos_service_1.roundMoney)(expected);
}
async function getOpenCashSession(branchId, tx = prismaClient_1.prisma) {
    return tx.pos_cash_sessions.findFirst({
        where: { branchId, status: "open" },
        orderBy: { openedAt: "desc" },
    });
}
async function requireOpenCashSession(branchId, tx = prismaClient_1.prisma) {
    const open = await getOpenCashSession(branchId, tx);
    if (!open) {
        throw new Error("No hay caja abierta en esta bodega. Abre caja antes de cobrar en efectivo.");
    }
    return open;
}
async function openCashSession(params) {
    const { branchId, userId, notes } = params;
    const openingFloat = money(params.openingFloat);
    if (!Number.isSafeInteger(branchId) || branchId <= 0) {
        throw new Error("Bodega inválida");
    }
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
        throw new Error("Fondo inicial inválido");
    }
    if (openingFloat > MAX_CASH_AMOUNT) {
        throw new Error("Fondo inicial excede el máximo permitido");
    }
    const branch = await prismaClient_1.prisma.branches.findFirst({
        where: { idBranche: branchId },
        select: { idBranche: true },
    });
    if (!branch)
        throw new Error("Bodega no encontrada");
    try {
        const created = await prismaClient_1.prisma.$transaction(async (tx) => {
            const existing = await tx.pos_cash_sessions.findFirst({
                where: { branchId, status: "open" },
                select: { idCashSession: true },
            });
            if (existing) {
                const full = await tx.pos_cash_sessions.findFirst({
                    where: { idCashSession: existing.idCashSession },
                    include: sessionInclude,
                });
                if (!full) {
                    throw new Error("Ya hay una caja abierta en esta bodega");
                }
                return { session: full, alreadyOpen: true };
            }
            const session = await tx.pos_cash_sessions.create({
                data: {
                    branchId,
                    openedByUserId: userId,
                    status: "open",
                    openingFloat: new client_1.Prisma.Decimal(openingFloat),
                    notes: notes ? String(notes).slice(0, 2000) : null,
                },
                include: sessionInclude,
            });
            return { session, alreadyOpen: false };
        }, {
            isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5_000,
            timeout: 10_000,
        });
        const expected = await computeExpectedCash(prismaClient_1.prisma, created.session.idCashSession);
        return {
            ...serializeCashSession(created.session, expected),
            alreadyOpen: created.alreadyOpen,
        };
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002") {
            const existing = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
                where: { branchId, status: "open" },
                include: sessionInclude,
                orderBy: { openedAt: "desc" },
            });
            if (existing) {
                const expected = await computeExpectedCash(prismaClient_1.prisma, existing.idCashSession);
                return {
                    ...serializeCashSession(existing, expected),
                    alreadyOpen: true,
                };
            }
            throw new Error("Ya hay una caja abierta en esta bodega");
        }
        throw error;
    }
}
async function addManualCashMovement(params) {
    const { branchId, userId, type } = params;
    const amount = money(params.amount);
    if (!["cash_in", "cash_out"].includes(type)) {
        throw new Error("Tipo de movimiento inválido");
    }
    assertCashAmount(amount);
    const reason = params.reason ? String(params.reason).trim() : "";
    if (reason.length < 5) {
        throw new Error("Indica un motivo claro (mín. 5 caracteres)");
    }
    return prismaClient_1.prisma.$transaction(async (tx) => {
        const session = await requireOpenCashSession(branchId, tx);
        if (type === "cash_out") {
            const expected = await computeExpectedCash(tx, session.idCashSession);
            if (amount > expected + DIFF_EPS) {
                throw new Error(`La salida (${amount.toFixed(2)}) supera el efectivo esperado en caja (${expected.toFixed(2)}).`);
            }
        }
        const created = await tx.pos_cash_movements.create({
            data: {
                cashSessionId: session.idCashSession,
                userId,
                type,
                amount: new client_1.Prisma.Decimal(amount),
                reason: reason.slice(0, 255),
            },
        });
        const full = await tx.pos_cash_sessions.findFirst({
            where: { idCashSession: session.idCashSession },
            include: sessionInclude,
        });
        const expected = await computeExpectedCash(tx, session.idCashSession);
        return {
            movement: {
                idCashMovement: Number(created.idCashMovement),
                type: created.type,
                amount: Number(created.amount),
                reason: created.reason,
                createdAt: created.createdAt,
            },
            session: serializeCashSession(full, expected),
        };
    }, {
        isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
    });
}
async function closeCashSession(params) {
    const { branchId, userId, notes } = params;
    const closingCounted = money(params.closingCounted);
    if (!Number.isFinite(closingCounted) || closingCounted < 0) {
        throw new Error("Conteo de cierre inválido");
    }
    if (closingCounted > MAX_CASH_AMOUNT) {
        throw new Error("Conteo de cierre excede el máximo permitido");
    }
    return prismaClient_1.prisma.$transaction(async (tx) => {
        const session = await requireOpenCashSession(branchId, tx);
        const expectedCash = await computeExpectedCash(tx, session.idCashSession);
        const difference = (0, pos_service_1.roundMoney)(closingCounted - expectedCash);
        const hasDiff = Math.abs(difference) > DIFF_EPS;
        const differenceReason = String(params.differenceReason || "")
            .trim()
            .slice(0, 500);
        if (hasDiff && differenceReason.length < 5) {
            throw new Error(`Hay descuadre de ${difference.toFixed(2)}. Debes indicar el motivo del descuadre (mín. 5 caracteres) antes de cerrar.`);
        }
        const claimed = await tx.pos_cash_sessions.updateMany({
            where: {
                idCashSession: session.idCashSession,
                status: "open",
            },
            data: {
                status: "closed",
                closedByUserId: userId,
                closedAt: new Date(),
                closingCounted: new client_1.Prisma.Decimal(closingCounted),
                expectedCash: new client_1.Prisma.Decimal(expectedCash),
                difference: new client_1.Prisma.Decimal(difference),
                differenceReason: hasDiff ? differenceReason : null,
                notes: notes
                    ? [session.notes, notes].filter(Boolean).join("\n---\n").slice(0, 4000)
                    : session.notes,
            },
        });
        if (claimed.count !== 1) {
            throw new Error("La caja ya fue cerrada por otra sesión. Recarga el estado de caja.");
        }
        const closed = await tx.pos_cash_sessions.findFirst({
            where: { idCashSession: session.idCashSession },
            include: sessionInclude,
        });
        if (!closed) {
            throw new Error("No se pudo recuperar la sesión de caja cerrada");
        }
        return serializeCashSession(closed, expectedCash);
    }, {
        isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
    });
}
async function getCashStatus(branchId) {
    if (!Number.isSafeInteger(branchId) || branchId <= 0) {
        throw new Error("Bodega inválida");
    }
    // Primero solo existencia (consulta mínima, no debe fallar por includes).
    const openId = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
        where: { branchId, status: "open" },
        select: { idCashSession: true },
        orderBy: { openedAt: "desc" },
    });
    if (!openId) {
        return {
            open: false,
            session: null,
            expectedCash: null,
            paymentSummary: null,
        };
    }
    let open = null;
    try {
        open = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
            where: { idCashSession: openId.idCashSession },
            include: sessionInclude,
        });
    }
    catch (error) {
        console.error("[getCashStatus] session include failed:", error);
        try {
            open = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
                where: { idCashSession: openId.idCashSession },
                include: sessionMetaInclude,
            });
        }
        catch (metaError) {
            console.error("[getCashStatus] session meta failed:", metaError);
            const bare = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
                where: { idCashSession: openId.idCashSession },
            });
            if (!bare) {
                return {
                    open: false,
                    session: null,
                    expectedCash: null,
                    paymentSummary: null,
                };
            }
            // Sesión abierta confirmada aunque fallen joins/resúmenes.
            return {
                open: true,
                session: serializeCashSession(bare),
                expectedCash: null,
                paymentSummary: null,
            };
        }
    }
    if (!open) {
        // Carrera rara: se cerró entre queries.
        return {
            open: false,
            session: null,
            expectedCash: null,
            paymentSummary: null,
        };
    }
    let expectedCash = null;
    try {
        expectedCash = await computeExpectedCash(prismaClient_1.prisma, open.idCashSession);
    }
    catch (error) {
        console.error("[getCashStatus] expectedCash failed:", error);
    }
    let paymentSummary = null;
    try {
        paymentSummary = await summarizeSessionPayments(Number(open.idCashSession));
    }
    catch (error) {
        console.error("[getCashStatus] paymentSummary failed:", error);
    }
    return {
        open: true,
        session: serializeCashSession(open, expectedCash ?? undefined),
        expectedCash,
        paymentSummary,
    };
}
/** Solo ventas ligadas a la sesión (sin huérfanas del intervalo). */
async function summarizeSessionPayments(cashSessionId) {
    const byMethod = {
        efectivo_sucursal: 0,
        tarjeta_sucursal: 0,
        tarjeta_credito_sucursal: 0,
        tarjeta_debito_sucursal: 0,
        transferencia_bancaria: 0,
        openpay_link: 0,
        otro: 0,
    };
    const [completedAgg, cancelledCount, paymentAgg] = await Promise.all([
        prismaClient_1.prisma.pos_sales.aggregate({
            where: { cashSessionId, status: "completed" },
            _count: { _all: true },
            _sum: { total: true },
        }),
        prismaClient_1.prisma.pos_sales.count({
            where: { cashSessionId, status: "cancelled" },
        }),
        prismaClient_1.prisma.pos_payments.groupBy({
            by: ["method"],
            where: {
                pos_sales: { cashSessionId, status: "completed" },
            },
            _sum: { amount: true },
        }),
    ]);
    for (const row of paymentAgg) {
        const m = String(row.method);
        byMethod[m] = (0, pos_service_1.roundMoney)(Number(row._sum.amount || 0));
    }
    return {
        salesCount: Number(completedAgg._count._all || 0),
        salesTotal: (0, pos_service_1.roundMoney)(Number(completedAgg._sum.total || 0)),
        cancelledCount,
        byMethod,
    };
}
async function listCashSessions(params) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 15));
    const where = {};
    if (params.branchId && Number.isSafeInteger(params.branchId)) {
        where.branchId = params.branchId;
    }
    const [total, rows] = await Promise.all([
        prismaClient_1.prisma.pos_cash_sessions.count({ where }),
        prismaClient_1.prisma.pos_cash_sessions.findMany({
            where,
            include: {
                branches: { select: { name: true, city: true } },
                openedBy: { select: { name: true, lastname: true } },
                closedBy: { select: { name: true, lastname: true } },
            },
            orderBy: { openedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        data: rows.map((r) => serializeCashSession(r)),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 0,
        },
    };
}
async function getCashSessionById(id) {
    const session = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
        where: { idCashSession: id },
        include: sessionInclude,
    });
    if (!session)
        return null;
    const expected = session.status === "open"
        ? await computeExpectedCash(prismaClient_1.prisma, session.idCashSession)
        : session.expectedCash != null
            ? Number(session.expectedCash)
            : await computeExpectedCash(prismaClient_1.prisma, session.idCashSession);
    return serializeCashSession(session, expected);
}
async function listCashSessionMovements(params) {
    const sessionId = params.sessionId;
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
        throw new Error("ID de sesión inválido");
    }
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 30));
    const session = await prismaClient_1.prisma.pos_cash_sessions.findFirst({
        where: { idCashSession: sessionId },
        include: sessionMetaInclude,
    });
    if (!session)
        return null;
    const where = { cashSessionId: session.idCashSession };
    const [total, rows] = await Promise.all([
        prismaClient_1.prisma.pos_cash_movements.count({ where }),
        prismaClient_1.prisma.pos_cash_movements.findMany({
            where,
            include: movementUserInclude,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    const expected = session.status === "open"
        ? await computeExpectedCash(prismaClient_1.prisma, session.idCashSession)
        : session.expectedCash != null
            ? Number(session.expectedCash)
            : await computeExpectedCash(prismaClient_1.prisma, session.idCashSession);
    return {
        session: serializeCashSession({ ...session, movements: [] }, expected, { movementsTotal: total }),
        data: rows.map(serializeCashMovement),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 0,
        },
    };
}
/** Registra efectivo de una venta completada dentro de una transacción. */
async function recordSaleCashInTx(tx, params) {
    if (params.cashAmount <= 0)
        return null;
    assertCashAmount(params.cashAmount, "Monto de efectivo");
    const already = await tx.pos_cash_movements.findFirst({
        where: {
            posSaleId: params.posSaleId,
            type: "sale_cash",
        },
        select: { idCashMovement: true, cashSessionId: true },
    });
    if (already)
        return already.cashSessionId;
    const session = await requireOpenCashSession(params.branchId, tx);
    await tx.pos_cash_movements.create({
        data: {
            cashSessionId: session.idCashSession,
            userId: params.userId,
            type: "sale_cash",
            amount: new client_1.Prisma.Decimal((0, pos_service_1.roundMoney)(params.cashAmount)),
            reason: "Venta POS",
            posSaleId: params.posSaleId,
        },
    });
    return session.idCashSession;
}
/**
 * Revierte efectivo al cancelar.
 * - Si la sesión original sigue abierta → sale_cash_void ahí.
 * - Si ya cerró → ajusta en la caja abierta actual (obligatorio abrirla).
 * - Idempotente si ya existe void para la venta.
 */
async function recordSaleCashVoidInTx(tx, params) {
    if (params.cashAmount <= 0)
        return;
    const alreadyVoid = await tx.pos_cash_movements.findFirst({
        where: {
            posSaleId: params.posSaleId,
            type: "sale_cash_void",
        },
        select: { idCashMovement: true },
    });
    if (alreadyVoid)
        return;
    let sessionId = params.cashSessionId;
    let reason = "Cancelación venta POS";
    if (sessionId) {
        const session = await tx.pos_cash_sessions.findFirst({
            where: { idCashSession: sessionId },
            select: { status: true, idCashSession: true },
        });
        if (session && session.status === "open") {
            sessionId = session.idCashSession;
        }
        else {
            const open = await getOpenCashSession(params.branchId, tx);
            if (!open) {
                throw new Error("La caja de esta venta ya está cerrada y no hay caja abierta ahora. Abre caja e intenta cancelar de nuevo: el efectivo se ajustará en la sesión actual.");
            }
            const closedId = session ? Number(session.idCashSession) : null;
            reason = `Ajuste por cancelación${params.folio ? ` ${params.folio}` : ""}${closedId ? ` (caja original #${closedId} ya cerrada)` : ""}`.slice(0, 255);
            sessionId = open.idCashSession;
        }
    }
    else {
        const open = await getOpenCashSession(params.branchId, tx);
        if (!open) {
            throw new Error("No se puede cancelar el efectivo: no hay caja abierta ni sesión vinculada. Abre caja e intenta de nuevo.");
        }
        sessionId = open.idCashSession;
    }
    await tx.pos_cash_movements.create({
        data: {
            cashSessionId: sessionId,
            userId: params.userId,
            type: "sale_cash_void",
            amount: new client_1.Prisma.Decimal((0, pos_service_1.roundMoney)(params.cashAmount)),
            reason,
            posSaleId: params.posSaleId,
        },
    });
}
//# sourceMappingURL=posCash.service.js.map