import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
import { roundMoney } from "./pos.service";

export type CashMovementType =
  | "cash_in"
  | "cash_out"
  | "sale_cash"
  | "sale_cash_void";

function money(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return NaN;
  return roundMoney(v);
}

export function serializeCashSession(session: any, expectedCash?: number) {
  const expected =
    expectedCash != null
      ? expectedCash
      : session.expectedCash != null
        ? Number(session.expectedCash)
        : null;

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
    closingCounted:
      session.closingCounted != null ? Number(session.closingCounted) : null,
    expectedCash: expected,
    difference:
      session.difference != null ? Number(session.difference) : null,
    notes: session.notes || null,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    movements: (session.movements || []).map((m: any) => ({
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
    })),
  };
}

const sessionInclude = {
  branches: { select: { name: true, city: true } },
  openedBy: { select: { name: true, lastname: true } },
  closedBy: { select: { name: true, lastname: true } },
  movements: {
    orderBy: { createdAt: "asc" as const },
    include: { users: { select: { name: true, lastname: true } } },
  },
};

/** Suma esperada en caja: fondo + entradas + ventas efectivo − salidas − voids. */
export async function computeExpectedCash(
  tx: Prisma.TransactionClient | typeof prisma,
  cashSessionId: bigint | number,
): Promise<number> {
  const session = await tx.pos_cash_sessions.findFirst({
    where: { idCashSession: cashSessionId },
    select: { openingFloat: true },
  });
  if (!session) throw new Error("Sesión de caja no encontrada");

  const movements = await tx.pos_cash_movements.findMany({
    where: { cashSessionId },
    select: { type: true, amount: true },
  });

  let expected = Number(session.openingFloat);
  for (const m of movements) {
    const amt = Number(m.amount);
    if (m.type === "cash_in" || m.type === "sale_cash") expected += amt;
    else if (m.type === "cash_out" || m.type === "sale_cash_void")
      expected -= amt;
  }
  return roundMoney(expected);
}

export async function getOpenCashSession(
  branchId: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.pos_cash_sessions.findFirst({
    where: { branchId, status: "open" },
    orderBy: { openedAt: "desc" },
  });
}

export async function requireOpenCashSession(
  branchId: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const open = await getOpenCashSession(branchId, tx);
  if (!open) {
    throw new Error(
      "No hay caja abierta en esta sucursal. Abre caja antes de cobrar en efectivo.",
    );
  }
  return open;
}

export async function openCashSession(params: {
  branchId: number;
  userId: number;
  openingFloat: number;
  notes?: string | null;
}) {
  const { branchId, userId, notes } = params;
  const openingFloat = money(params.openingFloat);
  if (!Number.isSafeInteger(branchId) || branchId <= 0) {
    throw new Error("Sucursal inválida");
  }
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    throw new Error("Fondo inicial inválido");
  }

  const branch = await prisma.branches.findFirst({
    where: { idBranche: branchId },
    select: { idBranche: true },
  });
  if (!branch) throw new Error("Sucursal no encontrada");

  const existing = await getOpenCashSession(branchId);
  if (existing) {
    throw new Error("Ya hay una caja abierta en esta sucursal");
  }

  const created = await prisma.pos_cash_sessions.create({
    data: {
      branchId,
      openedByUserId: userId,
      status: "open",
      openingFloat: new Prisma.Decimal(openingFloat),
      notes: notes ? String(notes).slice(0, 2000) : null,
    },
    include: sessionInclude,
  });

  const expected = await computeExpectedCash(prisma, created.idCashSession);
  return serializeCashSession(created, expected);
}

export async function addManualCashMovement(params: {
  branchId: number;
  userId: number;
  type: "cash_in" | "cash_out";
  amount: number;
  reason?: string | null;
}) {
  const { branchId, userId, type } = params;
  const amount = money(params.amount);
  if (!["cash_in", "cash_out"].includes(type)) {
    throw new Error("Tipo de movimiento inválido");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Monto inválido");
  }
  const reason = params.reason ? String(params.reason).trim() : "";
  if (reason.length < 3) {
    throw new Error("Indica un motivo (mín. 3 caracteres)");
  }

  const session = await requireOpenCashSession(branchId);
  const created = await prisma.pos_cash_movements.create({
    data: {
      cashSessionId: session.idCashSession,
      userId,
      type,
      amount: new Prisma.Decimal(amount),
      reason: reason.slice(0, 255),
    },
  });

  const full = await prisma.pos_cash_sessions.findFirst({
    where: { idCashSession: session.idCashSession },
    include: sessionInclude,
  });
  const expected = await computeExpectedCash(prisma, session.idCashSession);
  return {
    movement: {
      idCashMovement: Number(created.idCashMovement),
      type: created.type,
      amount: Number(created.amount),
      reason: created.reason,
      createdAt: created.createdAt,
    },
    session: serializeCashSession(full!, expected),
  };
}

export async function closeCashSession(params: {
  branchId: number;
  userId: number;
  closingCounted: number;
  notes?: string | null;
}) {
  const { branchId, userId, notes } = params;
  const closingCounted = money(params.closingCounted);
  if (!Number.isFinite(closingCounted) || closingCounted < 0) {
    throw new Error("Conteo de cierre inválido");
  }

  const session = await requireOpenCashSession(branchId);
  const expectedCash = await computeExpectedCash(prisma, session.idCashSession);
  const difference = roundMoney(closingCounted - expectedCash);

  const closed = await prisma.pos_cash_sessions.update({
    where: { idCashSession: session.idCashSession },
    data: {
      status: "closed",
      closedByUserId: userId,
      closedAt: new Date(),
      closingCounted: new Prisma.Decimal(closingCounted),
      expectedCash: new Prisma.Decimal(expectedCash),
      difference: new Prisma.Decimal(difference),
      notes: notes
        ? [session.notes, notes].filter(Boolean).join("\n---\n").slice(0, 4000)
        : session.notes,
    },
    include: sessionInclude,
  });

  return serializeCashSession(closed, expectedCash);
}

export async function getCashStatus(branchId: number) {
  if (!Number.isSafeInteger(branchId) || branchId <= 0) {
    throw new Error("Sucursal inválida");
  }
  const open = await prisma.pos_cash_sessions.findFirst({
    where: { branchId, status: "open" },
    include: sessionInclude,
    orderBy: { openedAt: "desc" },
  });
  if (!open) {
    return {
      open: false,
      session: null,
      expectedCash: null,
      paymentSummary: null,
    };
  }
  const expectedCash = await computeExpectedCash(prisma, open.idCashSession);
  const paymentSummary = await summarizeSessionPayments(
    Number(open.idCashSession),
    Number(open.branchId),
    open.openedAt,
  );
  return {
    open: true,
    session: serializeCashSession(open, expectedCash),
    expectedCash,
    paymentSummary,
  };
}

async function summarizeSessionPayments(
  cashSessionId: number,
  branchId: number,
  openedAt: Date,
) {
  const sales = await prisma.pos_sales.findMany({
    where: {
      branchId,
      status: "completed",
      OR: [
        { cashSessionId },
        {
          cashSessionId: null,
          createdAt: { gte: openedAt },
        },
      ],
    },
    include: { payments: true },
  });

  const byMethod: Record<string, number> = {
    efectivo_sucursal: 0,
    tarjeta_sucursal: 0,
    transferencia_bancaria: 0,
    openpay_link: 0,
  };
  let salesCount = 0;
  let salesTotal = 0;

  for (const sale of sales) {
    // Prefer sales linked to this session; for unlinked completed sales in window, include non-cash only once
    const linked = sale.cashSessionId != null && Number(sale.cashSessionId) === cashSessionId;
    const inWindow =
      sale.cashSessionId == null && sale.createdAt >= openedAt;
    if (!linked && !inWindow) continue;

    salesCount += 1;
    salesTotal = roundMoney(salesTotal + Number(sale.total));
    for (const p of sale.payments) {
      const m = String(p.method);
      byMethod[m] = roundMoney((byMethod[m] || 0) + Number(p.amount));
    }
  }

  return { salesCount, salesTotal, byMethod };
}

export async function listCashSessions(params: {
  branchId?: number | null;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(50, Math.max(1, params.limit || 15));
  const where: Prisma.pos_cash_sessionsWhereInput = {};
  if (params.branchId && Number.isSafeInteger(params.branchId)) {
    where.branchId = params.branchId;
  }

  const [total, rows] = await Promise.all([
    prisma.pos_cash_sessions.count({ where }),
    prisma.pos_cash_sessions.findMany({
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

export async function getCashSessionById(id: number) {
  const session = await prisma.pos_cash_sessions.findFirst({
    where: { idCashSession: id },
    include: sessionInclude,
  });
  if (!session) return null;
  const expected =
    session.status === "open"
      ? await computeExpectedCash(prisma, session.idCashSession)
      : session.expectedCash != null
        ? Number(session.expectedCash)
        : await computeExpectedCash(prisma, session.idCashSession);
  return serializeCashSession(session, expected);
}

/** Registra efectivo de una venta completada dentro de una transacción. */
export async function recordSaleCashInTx(
  tx: Prisma.TransactionClient,
  params: {
    branchId: number;
    userId: number;
    posSaleId: bigint | number;
    cashAmount: number;
  },
) {
  if (params.cashAmount <= 0) return null;
  const session = await requireOpenCashSession(params.branchId, tx);
  await tx.pos_cash_movements.create({
    data: {
      cashSessionId: session.idCashSession,
      userId: params.userId,
      type: "sale_cash",
      amount: new Prisma.Decimal(roundMoney(params.cashAmount)),
      reason: "Venta POS",
      posSaleId: params.posSaleId,
    },
  });
  return session.idCashSession;
}

/** Revierte efectivo al cancelar una venta (si había sesión vinculada o abierta). */
export async function recordSaleCashVoidInTx(
  tx: Prisma.TransactionClient,
  params: {
    branchId: number;
    userId: number;
    posSaleId: bigint | number;
    cashSessionId: bigint | number | null;
    cashAmount: number;
  },
) {
  if (params.cashAmount <= 0) return;
  let sessionId = params.cashSessionId;
  if (!sessionId) {
    const open = await getOpenCashSession(params.branchId, tx);
    if (!open) {
      throw new Error(
        "No se puede cancelar el efectivo: no hay caja abierta ni sesión vinculada. Abre caja o cancela solo si no hubo efectivo.",
      );
    }
    sessionId = open.idCashSession;
  } else {
    const session = await tx.pos_cash_sessions.findFirst({
      where: { idCashSession: sessionId },
      select: { status: true },
    });
    if (!session || session.status !== "open") {
      throw new Error(
        "La caja de esta venta ya está cerrada. No se puede cancelar el efectivo; reabre o ajusta con un movimiento manual.",
      );
    }
  }

  await tx.pos_cash_movements.create({
    data: {
      cashSessionId: sessionId,
      userId: params.userId,
      type: "sale_cash_void",
      amount: new Prisma.Decimal(roundMoney(params.cashAmount)),
      reason: "Cancelación venta POS",
      posSaleId: params.posSaleId,
    },
  });
}
