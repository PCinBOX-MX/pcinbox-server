import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
import { decrementPosStock } from "./posStock.service";
import { assignSerialsOnSale, assertSerialsAvailable } from "./posSerial.service";

type PendingSerialLine = {
  productId: number;
  serials: string[];
  warrantyMonths?: number | null;
};

/**
 * Completa una venta POS en pending_payment (stock + estado + series diferidas).
 * Usado por confirmación manual y por webhook OpenPay (link ORD-…).
 */
export async function completePendingPosSale(params: {
  idPosSale?: number | null;
  idLinkPago?: number | null;
  linkReferencia?: string | null;
  userId?: number | null;
  note?: string | null;
  source?: "manual" | "openpay_webhook";
}) {
  const source = params.source || "manual";
  const note = params.note ? String(params.note).slice(0, 2000) : null;

  const where: Prisma.pos_salesWhereInput = {};
  if (params.idPosSale && Number.isSafeInteger(params.idPosSale)) {
    where.idPosSale = params.idPosSale;
  } else if (params.idLinkPago != null && Number.isFinite(Number(params.idLinkPago))) {
    where.idLinkPago = Number(params.idLinkPago);
  } else if (params.linkReferencia) {
    where.linkReferencia = String(params.linkReferencia);
  } else {
    throw new Error("Falta idPosSale, idLinkPago o linkReferencia");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const sale = await tx.pos_sales.findFirst({
      where,
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!sale) throw new Error("Venta POS no encontrada");
    if (sale.status === "cancelled") {
      throw new Error("La venta está cancelada");
    }
    if (sale.status === "completed") {
      // Idempotente: ya completada (doble webhook)
      return { sale, alreadyCompleted: true as const };
    }
    if (sale.status !== "pending_payment") {
      throw new Error("Solo se pueden confirmar ventas pendientes de pago");
    }

    const userId =
      params.userId && Number.isSafeInteger(params.userId)
        ? params.userId
        : Number(sale.cashierUserId);

    await decrementPosStock(
      tx,
      sale.items.map((it) => ({
        productId: Number(it.productId),
        quantity: Number(it.quantity),
      })),
      Number(sale.branchId),
      userId,
      sale.folio,
    );

    // Series diferidas al crear venta OpenPay
    const pendingEvent = sale.events.find((e) => e.eventType === "serials_pending");
    const pendingPayload = pendingEvent?.payload as
      | { lines?: PendingSerialLine[] }
      | null;
    const lines = pendingPayload?.lines || [];
    if (lines.length > 0) {
      const flat = lines.flatMap((l) => l.serials);
      await assertSerialsAvailable(tx, flat);
      for (const line of lines) {
        if (!line.serials?.length) continue;
        const itemRow = sale.items.find(
          (i) => Number(i.productId) === Number(line.productId),
        );
        if (!itemRow) continue;
        await assignSerialsOnSale(tx, {
          productId: Number(line.productId),
          branchId: Number(sale.branchId),
          posSaleId: sale.idPosSale,
          posSaleItemId: itemRow.idPosSaleItem,
          serials: line.serials,
          customerUserId: sale.customerUserId
            ? Number(sale.customerUserId)
            : null,
          customerName: sale.customerName,
          warrantyMonths: line.warrantyMonths ?? 12,
        });
      }
    }

    const row = await tx.pos_sales.update({
      where: { idPosSale: sale.idPosSale },
      data: {
        status: "completed",
        events: {
          create: {
            userId,
            eventType: "payment_confirmed",
            reason: note,
            payload: {
              previousStatus: sale.status,
              source,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: {
        branches: { select: { name: true, city: true } },
        cashier: { select: { name: true, lastname: true } },
        customer: { select: { name: true, lastname: true, email: true } },
        items: {
          include: {
            serials: {
              select: {
                idProductSerial: true,
                serialNumber: true,
                status: true,
                warrantyMonths: true,
                warrantyExpiresAt: true,
              },
            },
          },
        },
        payments: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });

    return { sale: row, alreadyCompleted: false as const };
  });

  return updated;
}
