"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completePendingPosSale = completePendingPosSale;
const prismaClient_1 = require("../../db/prismaClient");
const posSerial_service_1 = require("./posSerial.service");
/**
 * Completa una venta POS en pending_payment.
 * El stock ya se reservó al crear el pending (OpenPay); aquí solo se confirma estado + series.
 */
async function completePendingPosSale(params) {
    const source = params.source || "manual";
    const note = params.note ? String(params.note).slice(0, 2000) : null;
    const where = {};
    if (params.idPosSale && Number.isSafeInteger(params.idPosSale)) {
        where.idPosSale = params.idPosSale;
    }
    else if (params.idLinkPago != null && Number.isFinite(Number(params.idLinkPago))) {
        where.idLinkPago = Number(params.idLinkPago);
    }
    else if (params.linkReferencia) {
        where.linkReferencia = String(params.linkReferencia);
    }
    else {
        throw new Error("Falta idPosSale, idLinkPago o linkReferencia");
    }
    const updated = await prismaClient_1.prisma.$transaction(async (tx) => {
        const sale = await tx.pos_sales.findFirst({
            where,
            include: {
                items: true,
                events: { orderBy: { createdAt: "asc" } },
            },
        });
        if (!sale)
            throw new Error("Venta POS no encontrada");
        if (sale.status === "cancelled") {
            throw new Error("La venta está cancelada");
        }
        if (sale.status === "completed") {
            return { sale, alreadyCompleted: true };
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
                                    warrantyMode: true,
                                    warrantyExpiresAt: true,
                                },
                            },
                        },
                    },
                    payments: true,
                    events: { orderBy: { createdAt: "asc" } },
                },
            });
            return { sale: fresh, alreadyCompleted: true };
        }
        const userId = params.userId && Number.isSafeInteger(params.userId)
            ? params.userId
            : Number(sale.cashierUserId);
        // Stock ya reservado al crear pending_payment — no volver a descontar.
        const pendingEvent = sale.events.find((e) => e.eventType === "serials_pending");
        const pendingPayload = pendingEvent?.payload;
        const lines = pendingPayload?.lines || [];
        if (lines.length > 0) {
            const flat = lines.flatMap((l) => l.serials);
            await (0, posSerial_service_1.assertSerialsAvailable)(tx, flat);
            const usedItemIds = new Set();
            for (const line of lines) {
                if (!line.serials?.length)
                    continue;
                const itemRow = sale.items.find((i) => {
                    const id = Number(i.idPosSaleItem);
                    if (usedItemIds.has(id))
                        return false;
                    if (Number(i.productId) !== Number(line.productId))
                        return false;
                    if (line.branchId != null &&
                        i.branchId != null &&
                        Number(i.branchId) !== Number(line.branchId)) {
                        return false;
                    }
                    return true;
                });
                if (!itemRow)
                    continue;
                usedItemIds.add(Number(itemRow.idPosSaleItem));
                const lineBranch = line.branchId != null
                    ? Number(line.branchId)
                    : itemRow.branchId != null
                        ? Number(itemRow.branchId)
                        : Number(sale.branchId);
                await (0, posSerial_service_1.assignSerialsOnSale)(tx, {
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
                    warrantyMode: line.warrantyMode ?? null,
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
                },
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
        return { sale: row, alreadyCompleted: false };
    });
    return updated;
}
//# sourceMappingURL=posComplete.service.js.map