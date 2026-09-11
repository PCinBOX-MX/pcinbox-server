import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
import { assignSerialsOnSale, assertSerialsAvailable } from "./posSerial.service";
import { ensurePosManualProduct } from "./posManualProduct.service";

type PendingSerialLine = {
  productId: number;
  branchId?: number | null;
  serials: string[];
  warrantyMonths?: number | null;
};

/**
 * Completa una venta POS en pending_payment.
 * El stock ya se reservó al crear el pending (OpenPay); aquí solo se confirma estado + series.
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
      return { sale, alreadyCompleted: true as const };
    }
    if (sale.status !== "pending_payment") {
      throw new Error("Solo se pueden confirmar ventas pendientes de pago");
    }

    // Transición atómica: evita doble confirm concurrente.
    const claimed = await tx.pos_sales.updateMany({
      where: { idPosSale: sale.idPosSale, status: "pending_payment" },
      data: { status: "completed" },
    });
    if (claimed.count === 0) {
      const fresh = await tx.pos_sales.findFirst({
        where: { idPosSale: sale.idPosSale },
        include: {
          branches: { select: { name: true, city: true } },
          cashier: { select: { name: true, lastname: true } },
          customer: { select: { name: true, lastname: true, email: true } },
          items: {
            include: {
              branches: { select: { name: true, city: true } },
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
      return { sale: fresh!, alreadyCompleted: true as const };
    }

    const userId =
      params.userId && Number.isSafeInteger(params.userId)
        ? params.userId
        : Number(sale.cashierUserId);

    // Stock ya reservado al crear pending_payment — no volver a descontar.

    const pendingEvent = sale.events.find((e) => e.eventType === "serials_pending");
    const pendingPayload = pendingEvent?.payload as
      | { lines?: PendingSerialLine[] }
      | null;
    const lines = pendingPayload?.lines || [];
    if (lines.length > 0) {
      const flat = lines.flatMap((l) => l.serials);
      await assertSerialsAvailable(tx, flat);
      const usedItemIds = new Set<number>();
      for (const line of lines) {
        if (!line.serials?.length) continue;
        const itemRow = sale.items.find((i) => {
          const id = Number(i.idPosSaleItem);
          if (usedItemIds.has(id)) return false;
          if (Number(i.productId) !== Number(line.productId)) return false;
          if (
            line.branchId != null &&
            i.branchId != null &&
            Number(i.branchId) !== Number(line.branchId)
          ) {
            return false;
          }
          return true;
        });
        if (!itemRow) continue;
        usedItemIds.add(Number(itemRow.idPosSaleItem));
        const lineBranch =
          line.branchId != null
            ? Number(line.branchId)
            : itemRow.branchId != null
              ? Number(itemRow.branchId)
              : Number(sale.branchId);
        await assignSerialsOnSale(tx, {
          productId: Number(line.productId),
          branchId: lineBranch,
          posSaleId: sale.idPosSale,
          posSaleItemId: itemRow.idPosSaleItem,
          serials: line.serials,
          customerUserId: sale.customerUserId
            ? Number(sale.customerUserId)
            : null,
          customerName: sale.customerName,
          warrantyMonths: line.warrantyMonths ?? null,
        });
      }
    }

    await tx.pos_sale_events.create({
      data: {
        posSaleId: sale.idPosSale,
        userId,
        eventType: "payment_confirmed",
        reason: note,
        payload: {
          previousStatus: "pending_payment",
          source,
          stockAlreadyReserved: true,
        } as Prisma.InputJsonValue,
      },
    });

    const row = await tx.pos_sales.findFirst({
      where: { idPosSale: sale.idPosSale },
      include: {
        branches: { select: { name: true, city: true } },
        cashier: { select: { name: true, lastname: true } },
        customer: { select: { name: true, lastname: true, email: true } },
        items: {
          include: {
            branches: { select: { name: true, city: true } },
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

    return { sale: row!, alreadyCompleted: false as const };
  });

  return updated;
}
