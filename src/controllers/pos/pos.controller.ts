import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prismaClient";
import CustomRequestI from "../../interfaces/customrequest.interface";
import {
  assertDiscountAllowed,
  computeLineTotal,
  getProductSerialFlags,
  invalidatePosSearchCatalog,
  nextPosFolio,
  roundMoney,
  searchPosProducts,
} from "../../services/pos/pos.service";
import { productsHaveSerialColumns } from "../../services/pos/posSerialFlags.service";
import {
  decrementPosStock,
  restorePosStock,
} from "../../services/pos/posStock.service";
import {
  addManualCashMovement,
  closeCashSession,
  getCashSessionById,
  getCashStatus,
  listCashSessions,
  openCashSession,
  recordSaleCashInTx,
  recordSaleCashVoidInTx,
  requireOpenCashSession,
} from "../../services/pos/posCash.service";
import {
  assignSerialsOnSale,
  assertSerialsAvailable,
  getSerialByNumber,
  markSerialRma,
  normalizeItemSerials,
  registerAvailableSerial,
  releaseSerialsOnCancel,
  searchSerials,
} from "../../services/pos/posSerial.service";
import { completePendingPosSale } from "../../services/pos/posComplete.service";
import { createLinkPayOnline } from "../../services/pasarelaPagos.service";
import { resolvePosCashBranchId } from "../../constants/pcinbox-pickup.constants";

const PAYMENT_METHODS = new Set([
  "efectivo_sucursal",
  "tarjeta_sucursal",
  "tarjeta_credito_sucursal",
  "tarjeta_debito_sucursal",
  "transferencia_bancaria",
  "openpay_link",
]);

function money(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return NaN;
  return roundMoney(v);
}

/** Efectivo puede exceder (cambio); otros métodos no. */
function settlePosPayments(
  total: number,
  payments: Array<{ method: string; amount: number }>,
) {
  let nonCashSum = 0;
  let cashReceived = 0;
  for (const p of payments) {
    if (p.method === "efectivo_sucursal") {
      cashReceived = roundMoney(cashReceived + p.amount);
    } else {
      nonCashSum = roundMoney(nonCashSum + p.amount);
    }
  }
  const safeTotal = roundMoney(Math.max(0, total));
  const nonCashOverpay = roundMoney(Math.max(0, nonCashSum - safeTotal));
  const cashDue = roundMoney(
    Math.max(0, safeTotal - Math.min(nonCashSum, safeTotal)),
  );
  const changeDue = roundMoney(Math.max(0, cashReceived - cashDue));
  const appliedCash = roundMoney(Math.min(cashReceived, cashDue));
  const paidApplied = roundMoney(Math.min(nonCashSum, safeTotal) + appliedCash);
  const remaining = roundMoney(Math.max(0, safeTotal - paidApplied));
  return {
    nonCashSum,
    cashReceived,
    cashDue,
    changeDue,
    paidApplied,
    remaining,
    nonCashOverpay,
    balanced: remaining <= 0.009 && nonCashOverpay <= 0.009,
  };
}

async function resolvePosRole(
  req: CustomRequestI,
): Promise<"admin" | "support"> {
  if (req.posRole === "admin" || req.posRole === "support") {
    return req.posRole;
  }
  const userId = Number(req.idUser);
  const user = await prisma.users.findFirst({
    where: { idUser: userId, active: 1 },
    select: { role: true },
  });
  if (user?.role === "support") return "support";
  return "admin";
}

function calendarDateInMexicoCity(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * support: pending_payment siempre; completed solo el mismo día (CDMX).
 * admin: cualquier venta no cancelada.
 */
function assertPosCancelAllowed(
  role: "admin" | "support",
  sale: { status: string; createdAt: Date },
): void {
  if (role === "admin") return;
  if (sale.status === "pending_payment") return;
  if (sale.status === "completed") {
    const saleDay = calendarDateInMexicoCity(new Date(sale.createdAt));
    const today = calendarDateInMexicoCity(new Date());
    if (saleDay === today) return;
    throw new Error(
      "Como soporte solo puedes cancelar ventas completadas del mismo día. Solicita a un administrador el override.",
    );
  }
  throw new Error("No se puede cancelar esta venta con tu rol");
}

function serializeSale(sale: any) {
  return {
    idPosSale: Number(sale.idPosSale),
    folio: sale.folio,
    branchId: Number(sale.branchId),
    branchName: sale.branches?.name || null,
    branchCity: sale.branches?.city || null,
    cashierUserId: Number(sale.cashierUserId),
    cashierName: sale.cashier
      ? `${sale.cashier.name || ""} ${sale.cashier.lastname || ""}`.trim()
      : null,
    customerUserId: sale.customerUserId ? Number(sale.customerUserId) : null,
    customerName: sale.customerName ||
      (sale.customer
        ? `${sale.customer.name || ""} ${sale.customer.lastname || ""}`.trim()
        : "Público general"),
    status: sale.status,
    subtotal: Number(sale.subtotal),
    discountTotal: Number(sale.discountTotal),
    total: Number(sale.total),
    notes: sale.notes,
    cancelReason: sale.cancelReason,
    cancelledAt: sale.cancelledAt,
    customerEmail: sale.customerEmail || null,
    customerPhone: sale.customerPhone || null,
    paymentLinkUrl: sale.paymentLinkUrl || null,
    checkoutLinkUrl: sale.checkoutLinkUrl || null,
    linkReferencia: sale.linkReferencia || null,
    idLinkPago: sale.idLinkPago != null ? Number(sale.idLinkPago) : null,
    cashSessionId:
      sale.cashSessionId != null ? Number(sale.cashSessionId) : null,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    items: (sale.items || []).map((it: any) => ({
      idPosSaleItem: Number(it.idPosSaleItem),
      productId: Number(it.productId),
      branchId: it.branchId != null ? Number(it.branchId) : null,
      branchName: it.branches?.name || null,
      branchCity: it.branches?.city || null,
      branchLabel: it.branches
        ? [it.branches.name, it.branches.city].filter(Boolean).join(" — ") ||
          null
        : null,
      productName: it.productName,
      productSku: it.productSku,
      productUpc: it.productUpc,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      discountPct: Number(it.discountPct),
      lineTotal: Number(it.lineTotal),
      serials: (it.serials || []).map((s: any) => ({
        idProductSerial: Number(s.idProductSerial),
        serialNumber: s.serialNumber,
        status: s.status,
        warrantyMonths: s.warrantyMonths,
        warrantyExpiresAt: s.warrantyExpiresAt,
      })),
    })),
    payments: (sale.payments || []).map((p: any) => ({
      idPosPayment: Number(p.idPosPayment),
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference,
      createdAt: p.createdAt,
    })),
    events: (sale.events || []).map((e: any) => ({
      idPosSaleEvent: Number(e.idPosSaleEvent),
      eventType: e.eventType,
      reason: e.reason,
      payload: e.payload,
      userId: e.userId ? Number(e.userId) : null,
      createdAt: e.createdAt,
    })),
  };
}

const saleInclude = {
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
  events: { orderBy: { createdAt: "asc" as const } },
};

export const listPosBranches = async (_req: Request, res: Response) => {
  try {
    const cashBranchId = await resolvePosCashBranchId();

    const branches = await prisma.branches.findMany({
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: {
        idBranche: true,
        name: true,
        city: true,
        providerId: true,
        providers: { select: { companyName: true } },
      },
    });

    const mapped = branches.map((b) => {
      const providerName = b.providers?.companyName?.trim() || null;
      const place = [b.name, b.city].filter(Boolean).join(" — ");
      const label =
        [place, providerName].filter(Boolean).join(" · ") ||
        `Sucursal ${b.idBranche}`;
      const id = Number(b.idBranche);
      const providerId = Number(b.providerId);
      return {
        idBranche: id,
        name: b.name,
        city: b.city,
        providerId,
        providerName,
        label,
        isCashPoint: cashBranchId != null && id === cashBranchId,
      };
    });

    const cashBranch =
      (cashBranchId
        ? mapped.find((b) => b.idBranche === cashBranchId)
        : null) ||
      (cashBranchId
        ? {
            idBranche: cashBranchId,
            name: "pcinbox",
            city: null,
            providerId: 1,
            providerName: "PCinBOX",
            label: "Sucursal PCinBOX",
            isCashPoint: true,
          }
        : null);

    return res.json({
      ok: true,
      data: mapped,
      cashBranchId: cashBranchId,
      cashBranch,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al listar sucursales",
    });
  }
};

export const searchPosProductsHandler = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "");
    const data = await searchPosProducts(q);
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al buscar productos",
    });
  }
};

export const searchPosCustomers = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ ok: true, data: [] });
    }
    const users = await prisma.users.findMany({
      where: {
        active: 1,
        role: "customer",
        OR: [
          { name: { contains: q } },
          { lastname: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      take: 20,
      orderBy: { name: "asc" },
      select: {
        idUser: true,
        name: true,
        lastname: true,
        email: true,
        phone: true,
      },
    });
    return res.json({
      ok: true,
      data: users.map((u) => ({
        idUser: Number(u.idUser),
        name: u.name,
        lastname: u.lastname,
        email: u.email,
        phone: u.phone,
        label: `${u.name || ""} ${u.lastname || ""}`.trim() + (u.email ? ` · ${u.email}` : ""),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al buscar clientes",
    });
  }
};

export const createPosSale = async (req: CustomRequestI, res: Response) => {
  try {
    const cashierUserId = Number(req.idUser);
    if (!Number.isSafeInteger(cashierUserId) || cashierUserId <= 0) {
      return res.status(401).json({ ok: false, message: "Sesión inválida" });
    }

    const {
      branchId,
      customerUserId,
      customerName,
      customerEmail,
      customerPhone,
      notes,
      items,
      payments,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: "Agrega al menos un producto" });
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ ok: false, message: "Registra al menos una forma de pago" });
    }

    const posRole = await resolvePosRole(req);
    const isAdmin = posRole === "admin";

    const normalizedItems: Array<{
      productId: number;
      branchId: number | null;
      quantity: number;
      unitPrice: number;
      discountPct: number;
      lineTotal: number;
      productName: string;
      productSku: string | null;
      productUpc: string | null;
      serials: string[];
      warrantyMonths: number | null;
      requiresSerial: boolean;
    }> = [];

    let subtotal = 0;
    let discountTotal = 0;
    let hasOpenpayOnlyPending = false;
    const allSerials: string[] = [];

    for (const raw of items) {
      const productId = Number(raw.productId);
      const quantity = Number(raw.quantity);
      const discountPct = Number(raw.discountPct ?? 0);
      const itemBranchId =
        raw.branchId != null && raw.branchId !== ""
          ? Number(raw.branchId)
          : null;

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, message: "Producto inválido" });
      }
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ ok: false, message: "Cantidad inválida" });
      }
      try {
        assertDiscountAllowed(discountPct, isAdmin);
      } catch (e: any) {
        return res.status(403).json({ ok: false, message: e.message });
      }

      const product = await prisma.products.findFirst({
        where: { idProduct: productId, active: 1 },
        select: {
          idProduct: true,
          name: true,
          price: true,
          sku: true,
          upc: true,
          stock: true,
          providerId: true,
        },
      });
      if (!product) {
        return res.status(404).json({
          ok: false,
          message: `Producto ${productId} no encontrado`,
        });
      }

      const serialFlags = await getProductSerialFlags(productId);

      const providerBranches = await prisma.branches.findMany({
        where: { providerId: product.providerId },
        select: { idBranche: true },
      });
      const providerBranchIds = new Set(
        providerBranches.map((b) => Number(b.idBranche)),
      );
      const stockRows = await prisma.product_stock.findMany({
        where: { productId },
        select: { branchId: true, stock: true },
      });
      const hasBranchStockRows = stockRows.length > 0;

      let resolvedBranchId: number | null = itemBranchId;
      if (hasBranchStockRows || providerBranchIds.size > 0) {
        if (
          resolvedBranchId == null ||
          !Number.isSafeInteger(resolvedBranchId) ||
          resolvedBranchId <= 0
        ) {
          return res.status(400).json({
            ok: false,
            message: `Elige bodega/almacén para: ${product.name}`,
          });
        }
        if (
          providerBranchIds.size > 0 &&
          !providerBranchIds.has(resolvedBranchId)
        ) {
          return res.status(400).json({
            ok: false,
            message: `La bodega elegida no pertenece al proveedor de ${product.name}`,
          });
        }
        const row = stockRows.find(
          (r) => Number(r.branchId) === resolvedBranchId,
        );
        const available = Number(row?.stock ?? 0);
        if (available < quantity) {
          return res.status(400).json({
            ok: false,
            message: `Stock insuficiente en bodega para ${product.name} (disponible ${available})`,
          });
        }
      } else {
        // PCinbox u otros sin product_stock: solo stock global
        resolvedBranchId = null;
        if (Number(product.stock) < quantity) {
          return res.status(400).json({
            ok: false,
            message: `Stock global insuficiente para ${product.name}`,
          });
        }
      }

      const unitPrice =
        raw.unitPrice != null && Number.isFinite(Number(raw.unitPrice))
          ? money(raw.unitPrice)
          : money(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ ok: false, message: "Precio inválido" });
      }

      let serials: string[] = [];
      try {
        serials = normalizeItemSerials(
          quantity,
          Boolean(serialFlags.requiresSerial),
          raw.serials,
          product.name,
        );
      } catch (e: any) {
        return res.status(400).json({ ok: false, message: e.message });
      }
      allSerials.push(...serials);

      const lineBase = roundMoney(unitPrice * quantity);
      const lineTotal = computeLineTotal(unitPrice, quantity, discountPct);
      subtotal = roundMoney(subtotal + lineBase);
      discountTotal = roundMoney(discountTotal + (lineBase - lineTotal));

      normalizedItems.push({
        productId,
        branchId: resolvedBranchId,
        quantity,
        unitPrice,
        discountPct: roundMoney(discountPct),
        lineTotal,
        productName: product.name,
        productSku: product.sku,
        productUpc: product.upc,
        serials,
        warrantyMonths: serialFlags.warrantyMonths,
        requiresSerial: Boolean(serialFlags.requiresSerial),
      });
    }

    const serialUpper = allSerials.map((s) => s.toUpperCase());
    if (new Set(serialUpper).size !== serialUpper.length) {
      return res.status(400).json({
        ok: false,
        message: "Hay números de serie duplicados entre líneas de la venta",
      });
    }

    const total = roundMoney(subtotal - discountTotal);

    const normalizedPayments: Array<{
      method: any;
      amount: number;
      reference: string | null;
    }> = [];
    for (const raw of payments) {
      const method = String(raw.method || "");
      const amount = money(raw.amount);
      if (!PAYMENT_METHODS.has(method)) {
        return res.status(400).json({
          ok: false,
          message: `Método de pago no válido: ${method}`,
        });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          ok: false,
          message: "Monto de pago inválido",
        });
      }
      if (method === "openpay_link") hasOpenpayOnlyPending = true;
      normalizedPayments.push({
        method,
        amount,
        reference: raw.reference ? String(raw.reference).slice(0, 255) : null,
      });
    }

    const settlement = settlePosPayments(total, normalizedPayments);
    if (settlement.nonCashOverpay > 0.009) {
      return res.status(400).json({
        ok: false,
        message:
          "Tarjeta/transferencia no pueden superar el total. El excedente solo aplica en efectivo (cambio).",
      });
    }
    if (!settlement.balanced) {
      return res.status(400).json({
        ok: false,
        message: `Falta por cubrir ${settlement.remaining}. Recibido en efectivo: ${settlement.cashReceived}; adeudo efectivo: ${settlement.cashDue}.`,
      });
    }

    // Persistir monto aplicado a la venta (no el billete); recibido/cambio en reference.
    const nonCashPayments = normalizedPayments.filter(
      (p) => p.method !== "efectivo_sucursal",
    );
    const cashUserRefs = normalizedPayments
      .filter((p) => p.method === "efectivo_sucursal")
      .map((p) => p.reference)
      .filter(Boolean)
      .join(" | ");
    const cashRefParts = [
      settlement.cashReceived > settlement.cashDue + 0.009
        ? `Recibido ${settlement.cashReceived.toFixed(2)}`
        : null,
      settlement.changeDue > 0.009
        ? `Cambio ${settlement.changeDue.toFixed(2)}`
        : null,
      cashUserRefs || null,
    ].filter(Boolean);
    const finalPayments: Array<{
      method: any;
      amount: number;
      reference: string | null;
    }> = [...nonCashPayments];
    if (settlement.cashDue > 0.009) {
      finalPayments.push({
        method: "efectivo_sucursal",
        amount: settlement.cashDue,
        reference: cashRefParts.length
          ? cashRefParts.join(" · ").slice(0, 255)
          : null,
      });
    }

    // OpenPay link alone → pending (no stock yet). Mixed with immediate methods not allowed with openpay in MVP.
    const onlyOpenpay =
      finalPayments.length === 1 &&
      finalPayments[0]?.method === "openpay_link";
    const hasOpenpay = finalPayments.some((p) => p.method === "openpay_link");
    if (hasOpenpay && !onlyOpenpay) {
      return res.status(400).json({
        ok: false,
        message:
          "OpenPay link no se puede combinar con otros métodos en esta versión. Cobra en efectivo/tarjeta/transferencia o solo con link.",
      });
    }

    const status = onlyOpenpay ? "pending_payment" : "completed";
    void hasOpenpayOnlyPending;

    const cashAmount = settlement.cashDue;

    // Encabezado / caja: siempre sucursal física PCinBOX (no se elige en UI)
    let branch = await resolvePosCashBranchId();
    if (branchId != null && branchId !== "") {
      const explicit = Number(branchId);
      if (Number.isSafeInteger(explicit) && explicit > 0) branch = explicit;
    }
    if (!branch || !Number.isSafeInteger(branch) || branch <= 0) {
      const fromItems = normalizedItems.find((it) => it.branchId != null)?.branchId;
      branch = fromItems != null ? Number(fromItems) : NaN;
    }
    if (!Number.isSafeInteger(branch) || branch <= 0) {
      return res.status(400).json({
        ok: false,
        message:
          "No está configurada la sucursal de cobro PCinBOX (sin branch providerId=1 ni leon2). Revisa branches en BD.",
      });
    }

    let guestEmail = String(customerEmail || "").trim();
    let guestPhone = String(customerPhone || "").trim();
    let guestName = String(customerName || "").trim();
    let guestLastname = "";

    let customerUser: number | null = null;
    if (customerUserId != null && customerUserId !== "") {
      const cid = Number(customerUserId);
      if (!Number.isSafeInteger(cid) || cid <= 0) {
        return res.status(400).json({ ok: false, message: "Cliente inválido" });
      }
      const exists = await prisma.users.findFirst({
        where: { idUser: cid, active: 1 },
        select: {
          idUser: true,
          name: true,
          lastname: true,
          email: true,
          phone: true,
        },
      });
      if (!exists) {
        return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
      }
      customerUser = cid;
      guestName = guestName || `${exists.name || ""}`.trim();
      guestLastname = exists.lastname || "";
      guestEmail = guestEmail || exists.email || "";
      guestPhone = guestPhone || exists.phone || "";
    }

    if (onlyOpenpay) {
      if (!guestEmail || !guestPhone) {
        return res.status(400).json({
          ok: false,
          message:
            "Para OpenPay link necesitas email y teléfono del cliente (o seleccionar un cliente registrado con esos datos).",
        });
      }
      if (!guestName) guestName = "Cliente POS";
    }

    const sale = await prisma.$transaction(async (tx) => {
      const folio = await nextPosFolio(tx);
      const displayName =
        [guestName, guestLastname].filter(Boolean).join(" ").trim() ||
        (customerUser ? null : "Público general");

      let cashSessionId: bigint | null = null;
      if (status === "completed" && cashAmount > 0) {
        const openCash = await requireOpenCashSession(branch, tx);
        cashSessionId = openCash.idCashSession;
      }

      const created = await tx.pos_sales.create({
        data: {
          folio,
          branchId: branch,
          cashierUserId,
          customerUserId: customerUser,
          customerName: displayName,
          customerEmail: onlyOpenpay ? guestEmail : guestEmail || null,
          customerPhone: onlyOpenpay ? guestPhone : guestPhone || null,
          status,
          subtotal,
          discountTotal,
          total,
          notes: notes ? String(notes).slice(0, 2000) : null,
          cashSessionId,
          items: {
            create: normalizedItems.map((it) => ({
              productId: it.productId,
              branchId: it.branchId,
              productName: it.productName,
              productSku: it.productSku,
              productUpc: it.productUpc,
              quantity: it.quantity,
              unitPrice: new Prisma.Decimal(it.unitPrice),
              discountPct: new Prisma.Decimal(it.discountPct),
              lineTotal: new Prisma.Decimal(it.lineTotal),
            })),
          },
          payments: {
            create: finalPayments.map((p) => ({
              method: p.method,
              amount: new Prisma.Decimal(p.amount),
              reference: p.reference,
            })),
          },
          events: {
            create: [
              {
                userId: cashierUserId,
                eventType: "created",
                reason: null,
                payload: {
                  status,
                  total,
                  itemCount: normalizedItems.length,
                  isAdmin,
                  posRole,
                  cashAmount: cashAmount > 0 ? cashAmount : undefined,
                  cashReceived:
                    settlement.cashReceived > 0
                      ? settlement.cashReceived
                      : undefined,
                  changeDue:
                    settlement.changeDue > 0.009
                      ? settlement.changeDue
                      : undefined,
                } as Prisma.InputJsonValue,
              },
              ...(status === "pending_payment" &&
              normalizedItems.some((it) => it.serials.length > 0)
                ? [
                    {
                      userId: cashierUserId,
                      eventType: "serials_pending",
                      reason: null,
                      payload: {
                        lines: normalizedItems
                          .filter((it) => it.serials.length > 0)
                          .map((it) => ({
                            productId: it.productId,
                            branchId: it.branchId,
                            serials: it.serials,
                            warrantyMonths: it.warrantyMonths,
                          })),
                      } as Prisma.InputJsonValue,
                    },
                  ]
                : []),
            ],
          },
        },
        include: saleInclude,
      });

      if (status === "completed" && cashAmount > 0) {
        await recordSaleCashInTx(tx, {
          branchId: branch,
          userId: cashierUserId,
          posSaleId: created.idPosSale,
          cashAmount,
        });
      }

      const allSerialsFlat = normalizedItems.flatMap((it) => it.serials);
      if (allSerialsFlat.length > 0) {
        await assertSerialsAvailable(tx, allSerialsFlat);
        // Solo asignar series si la venta ya está cobrada. OpenPay pendiente las guarda en evento.
        if (status === "completed") {
          for (const norm of normalizedItems) {
            if (!norm.serials.length) continue;
            const itemRow = created.items.find(
              (i) => Number(i.productId) === norm.productId,
            );
            if (!itemRow) continue;
            await assignSerialsOnSale(tx, {
              productId: norm.productId,
              branchId: norm.branchId ?? branch,
              posSaleId: created.idPosSale,
              posSaleItemId: itemRow.idPosSaleItem,
              serials: norm.serials,
              customerUserId: customerUser,
              customerName: displayName,
              warrantyMonths: norm.warrantyMonths,
            });
          }
        }
      }

      if (status === "completed") {
        await decrementPosStock(
          tx,
          normalizedItems.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            branchId: it.branchId,
          })),
          cashierUserId,
          folio,
        );
        invalidatePosSearchCatalog();
      }

      return tx.pos_sales.findFirst({
        where: { idPosSale: created.idPosSale },
        include: saleInclude,
      });
    });

    if (!sale) {
      return res.status(500).json({
        ok: false,
        message: "La venta se creó pero no se pudo recuperar",
      });
    }

    let paymentLink: string | null = null;
    let checkoutLink: string | null = null;
    let linkReferencia: string | null = null;

    if (onlyOpenpay) {
      try {
        const linkRes = await createLinkPayOnline({
          name: guestName,
          lastname: guestLastname || null,
          email: guestEmail,
          phone: guestPhone,
          monto: total,
          products: normalizedItems.map((it) => ({
            idProduct: it.productId,
            name: it.productName,
            price: it.lineTotal / it.quantity,
            quantity: it.quantity,
          })),
        });

        paymentLink = linkRes.link || null;
        checkoutLink = linkRes.checkoutLink || null;
        linkReferencia = linkRes.referencia || null;

        const openPayPayment = sale.payments.find(
          (p) => p.method === "openpay_link",
        );
        if (openPayPayment) {
          await prisma.pos_payments.update({
            where: { idPosPayment: openPayPayment.idPosPayment },
            data: {
              reference: [
                linkReferencia,
                paymentLink,
                checkoutLink,
              ]
                .filter(Boolean)
                .join(" | ")
                .slice(0, 255),
            },
          });
        }

        await prisma.pos_sales.update({
          where: { idPosSale: sale.idPosSale },
          data: {
            paymentLinkUrl: paymentLink,
            checkoutLinkUrl: checkoutLink,
            linkReferencia,
            idLinkPago: linkRes.idLinkPago ?? null,
          },
        });

        await prisma.pos_sale_events.create({
          data: {
            posSaleId: sale.idPosSale,
            userId: cashierUserId,
            eventType: "openpay_link_created",
            payload: {
              referencia: linkReferencia,
              idLinkPago: linkRes.idLinkPago,
              link: paymentLink,
              checkoutLink,
            } as Prisma.InputJsonValue,
          },
        });
      } catch (linkError: any) {
        await prisma.pos_sale_events.create({
          data: {
            posSaleId: sale.idPosSale,
            userId: cashierUserId,
            eventType: "openpay_link_failed",
            reason: linkError?.message || "Error generando link",
          },
        });
        return res.status(201).json({
          ok: true,
          message:
            "Venta pendiente creada, pero falló la generación del link OpenPay. Revisa API_URL_PAGOS / pasarela.",
          data: {
            ...serializeSale(
              (await prisma.pos_sales.findFirst({
                where: { idPosSale: sale.idPosSale },
                include: saleInclude,
              }))!,
            ),
            paymentLink: null,
            checkoutLink: null,
            linkError: linkError?.message || "Error generando link",
          },
        });
      }
    }

    const fresh = await prisma.pos_sales.findFirst({
      where: { idPosSale: sale.idPosSale },
      include: saleInclude,
    });

    return res.status(201).json({
      ok: true,
      message:
        status === "pending_payment"
          ? "Venta pendiente: comparte el link OpenPay. El stock se descuenta al confirmar el pago."
          : "Venta POS completada",
      data: {
        ...serializeSale(fresh!),
        paymentLink,
        checkoutLink,
        linkReferencia,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo completar la venta",
    });
  }
};

export const listPosSales = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const folio = req.query.folio ? String(req.query.folio).trim() : "";
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const where: Prisma.pos_salesWhereInput = {};
    if (branchId && Number.isSafeInteger(branchId)) where.branchId = branchId;
    if (status && ["completed", "cancelled", "pending_payment"].includes(status)) {
      where.status = status as any;
    }
    if (folio) where.folio = { contains: folio };
    if (from || to) {
      where.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) where.createdAt.gte = from;
      if (to && !Number.isNaN(to.getTime())) where.createdAt.lte = to;
    }

    const [total, rows] = await Promise.all([
      prisma.pos_sales.count({ where }),
      prisma.pos_sales.findMany({
        where,
        include: saleInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      ok: true,
      data: rows.map(serializeSale),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al listar ventas POS",
    });
  }
};

export const getPosSaleById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }
    const sale = await prisma.pos_sales.findFirst({
      where: { idPosSale: id },
      include: saleInclude,
    });
    if (!sale) {
      return res.status(404).json({ ok: false, message: "Venta no encontrada" });
    }
    return res.json({ ok: true, data: serializeSale(sale) });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al obtener la venta",
    });
  }
};

export const cancelPosSale = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || "").trim();

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }
    if (reason.length < 3) {
      return res.status(400).json({
        ok: false,
        message: "Indica un motivo de cancelación (mín. 3 caracteres)",
      });
    }

    const posRole = await resolvePosRole(req);

    const updated = await prisma.$transaction(async (tx) => {
      const sale = await tx.pos_sales.findFirst({
        where: { idPosSale: id },
        include: { items: true, payments: true },
      });
      if (!sale) throw new Error("Venta no encontrada");
      if (sale.status === "cancelled") {
        throw new Error("Esta venta ya está cancelada");
      }

      assertPosCancelAllowed(posRole, {
        status: sale.status,
        createdAt: sale.createdAt,
      });

      if (sale.status === "completed") {
        await restorePosStock(
          tx,
          sale.items.map((it) => ({
            productId: Number(it.productId),
            quantity: Number(it.quantity),
            branchId: it.branchId != null ? Number(it.branchId) : null,
          })),
          userId,
          sale.folio,
        );
        invalidatePosSearchCatalog();

        const cashAmount = roundMoney(
          sale.payments
            .filter((p) => p.method === "efectivo_sucursal")
            .reduce((s, p) => s + Number(p.amount), 0),
        );
        if (cashAmount > 0) {
          await recordSaleCashVoidInTx(tx, {
            branchId: Number(sale.branchId),
            userId,
            posSaleId: sale.idPosSale,
            cashSessionId: sale.cashSessionId,
            cashAmount,
          });
        }
      }

      await releaseSerialsOnCancel(tx, sale.idPosSale);

      const row = await tx.pos_sales.update({
        where: { idPosSale: id },
        data: {
          status: "cancelled",
          cancelReason: reason.slice(0, 2000),
          cancelledAt: new Date(),
          cancelledByUserId: userId,
          events: {
            create: {
              userId,
              eventType: "cancelled",
              reason: reason.slice(0, 2000),
              payload: {
                previousStatus: sale.status,
                cancelledByRole: posRole,
              } as Prisma.InputJsonValue,
            },
          },
        },
        include: saleInclude,
      });
      return row;
    });

    return res.json({
      ok: true,
      message: "Venta cancelada. El inventario fue restaurado si aplica.",
      data: serializeSale(updated),
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo cancelar la venta",
    });
  }
};

/** Confirma pago de venta pending_payment (p.ej. OpenPay ya cobrado) y descuenta stock. */
export const confirmPosPayment = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }

    const result = await completePendingPosSale({
      idPosSale: id,
      userId,
      note: String(req.body?.note || "").trim() || null,
      source: "manual",
    });

    return res.json({
      ok: true,
      message: result.alreadyCompleted
        ? "La venta ya estaba completada"
        : "Pago confirmado. Inventario descontado.",
      data: serializeSale(result.sale),
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo confirmar el pago",
    });
  }
};

/**
 * Callback interno desde la pasarela cuando un link OpenPay (ORD-…) se paga.
 * Auth: header X-POS-Internal-Secret === POS_INTERNAL_SECRET
 */
export const completePosByOpenPayLink = async (req: Request, res: Response) => {
  try {
    const expected = process.env.POS_INTERNAL_SECRET?.trim();
    const provided = String(
      req.headers["x-pos-internal-secret"] || req.body?.secret || "",
    ).trim();
    if (!expected || !provided || provided !== expected) {
      return res.status(401).json({ ok: false, message: "No autorizado" });
    }

    const idLinkPago =
      req.body?.idLinkPago != null ? Number(req.body.idLinkPago) : null;
    const linkReferencia = req.body?.linkReferencia
      ? String(req.body.linkReferencia)
      : null;

    const result = await completePendingPosSale({
      idLinkPago,
      linkReferencia,
      userId: null,
      note: "Confirmación automática OpenPay webhook",
      source: "openpay_webhook",
    });

    return res.json({
      ok: true,
      alreadyCompleted: result.alreadyCompleted,
      message: result.alreadyCompleted
        ? "Venta POS ya estaba completada"
        : "Venta POS completada por webhook OpenPay",
      data: {
        idPosSale: Number(result.sale.idPosSale),
        folio: result.sale.folio,
        status: result.sale.status,
      },
    });
  } catch (error: any) {
    // 404 si no hay venta POS ligada (link de admin genérico, no POS)
    const msg = error?.message || "No se pudo completar venta POS";
    const notFound = /no encontrada/i.test(msg);
    return res.status(notFound ? 404 : 400).json({
      ok: false,
      message: msg,
    });
  }
};

/** Regenera link OpenPay para una venta pending_payment. */
export const retryPosPaymentLink = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const userId = Number(req.idUser);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }

    const sale = await prisma.pos_sales.findFirst({
      where: { idPosSale: id },
      include: { items: true, payments: true, customer: true },
    });
    if (!sale) {
      return res.status(404).json({ ok: false, message: "Venta no encontrada" });
    }
    if (sale.status !== "pending_payment") {
      return res.status(400).json({
        ok: false,
        message: "Solo se puede regenerar link en ventas pendientes de pago",
      });
    }

    const hasOpenpay = sale.payments.some((p) => p.method === "openpay_link");
    if (!hasOpenpay) {
      return res.status(400).json({
        ok: false,
        message: "Esta venta no usa OpenPay link",
      });
    }

    const email =
      String(req.body?.email || sale.customerEmail || sale.customer?.email || "").trim();
    const phone =
      String(req.body?.phone || sale.customerPhone || sale.customer?.phone || "").trim();
    const name =
      String(sale.customerName || sale.customer?.name || "Cliente POS").trim();
    const lastname = sale.customer?.lastname || "";

    if (!email || !phone) {
      return res.status(400).json({
        ok: false,
        message: "Email y teléfono son requeridos para regenerar el link",
      });
    }

    const linkRes = await createLinkPayOnline({
      name,
      lastname,
      email,
      phone,
      monto: Number(sale.total),
      products: sale.items.map((it) => ({
        idProduct: Number(it.productId),
        name: it.productName,
        price: Number(it.lineTotal) / Math.max(1, Number(it.quantity)),
        quantity: Number(it.quantity),
      })),
    });

    const updated = await prisma.pos_sales.update({
      where: { idPosSale: id },
      data: {
        customerEmail: email,
        customerPhone: phone,
        paymentLinkUrl: linkRes.link || null,
        checkoutLinkUrl: linkRes.checkoutLink || null,
        linkReferencia: linkRes.referencia || null,
        idLinkPago: linkRes.idLinkPago ?? null,
        events: {
          create: {
            userId,
            eventType: "openpay_link_retry",
            payload: {
              referencia: linkRes.referencia,
              idLinkPago: linkRes.idLinkPago,
              link: linkRes.link,
              checkoutLink: linkRes.checkoutLink,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: saleInclude,
    });

    const openPayPayment = updated.payments.find((p) => p.method === "openpay_link");
    if (openPayPayment) {
      await prisma.pos_payments.update({
        where: { idPosPayment: openPayPayment.idPosPayment },
        data: {
          reference: [linkRes.referencia, linkRes.link, linkRes.checkoutLink]
            .filter(Boolean)
            .join(" | ")
            .slice(0, 255),
        },
      });
    }

    return res.json({
      ok: true,
      message: "Link OpenPay regenerado",
      data: {
        ...serializeSale(
          await prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: saleInclude,
          }),
        ),
        paymentLink: linkRes.link,
        checkoutLink: linkRes.checkoutLink,
        linkReferencia: linkRes.referencia,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo regenerar el link",
    });
  }
};

export const getPosSaleTicket = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }
    const sale = await prisma.pos_sales.findFirst({
      where: { idPosSale: id },
      include: saleInclude,
    });
    if (!sale) {
      return res.status(404).json({ ok: false, message: "Venta no encontrada" });
    }

    const data = serializeSale(sale);
    const formatMoney = (n: number) =>
      n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const methodLabel: Record<string, string> = {
      efectivo_sucursal: "Efectivo",
      tarjeta_sucursal: "Tarjeta",
      tarjeta_credito_sucursal: "Tarjeta de Crédito",
      tarjeta_debito_sucursal: "Tarjeta de Débito",
      transferencia_bancaria: "Transferencia",
      openpay_link: "OpenPay (link)",
    };

    const itemsHtml = data.items
      .map((it: (typeof data.items)[number]) => {
        const serialLine =
          it.serials && it.serials.length
            ? `<br/><small>S/N: ${it.serials
                .map((s: { serialNumber: string }) => escapeHtml(s.serialNumber))
                .join(", ")}</small>`
            : "";
        return `
      <tr>
        <td>${escapeHtml(it.productName)}${it.productSku ? `<br/><small>SKU: ${escapeHtml(it.productSku)}</small>` : ""}${serialLine}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td style="text-align:right">${formatMoney(it.unitPrice)}</td>
        <td style="text-align:right">${it.discountPct ? `${it.discountPct}%` : "—"}</td>
        <td style="text-align:right">${formatMoney(it.lineTotal)}</td>
      </tr>`;
      })
      .join("");

    const paymentsHtml = data.payments
      .map(
        (p: (typeof data.payments)[number]) =>
          `<div class="pay-line"><span>${methodLabel[p.method] || p.method}${
            p.reference ? `<br/><small>${escapeHtml(p.reference)}</small>` : ""
          }</span><strong>${formatMoney(p.amount)}</strong></div>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ticket ${escapeHtml(data.folio)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f3f4f6; padding: 24px; }
    .ticket { max-width: 420px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px 20px; }
    h1 { font-size: 20px; text-align: center; color: #bb3d4b; margin-bottom: 4px; }
    .muted { color: #6b7280; font-size: 12px; text-align: center; margin-bottom: 16px; }
    .meta { font-size: 13px; margin-bottom: 14px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
    th { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; color: #6b7280; font-weight: 600; }
    td { padding: 8px 4px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .totals { margin-top: 12px; font-size: 13px; }
    .totals .row { display: flex; justify-content: space-between; margin: 4px 0; }
    .totals .grand { font-size: 18px; font-weight: 700; margin-top: 8px; padding-top: 8px; border-top: 2px dashed #e5e7eb; }
    .pay-line { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
    .actions { margin-top: 18px; display: flex; gap: 8px; justify-content: center; }
    button { border: 0; background: #bb3d4b; color: #fff; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #ecfdf5; color: #166534; }
    .status.cancelled { background: #fef2f2; color: #991b1b; }
    .status.pending_payment { background: #fffbeb; color: #92400e; }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .ticket { border: 0; box-shadow: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <h1>PCinBOX</h1>
    <p class="muted">Ticket de Punto de Venta</p>
    <div class="meta">
      <div><strong>Folio:</strong> ${escapeHtml(data.folio)}
        <span class="status ${escapeHtml(data.status)}">${escapeHtml(data.status)}</span>
      </div>
      <div><strong>Fecha:</strong> ${new Date(data.createdAt).toLocaleString("es-MX")}</div>
      <div><strong>Sucursal:</strong> ${escapeHtml([data.branchName, data.branchCity].filter(Boolean).join(" — ") || String(data.branchId))}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(data.customerName || "Público general")}</div>
      <div><strong>Vendedor:</strong> ${escapeHtml(data.cashierName || "—")}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th style="text-align:center">Cant</th>
          <th style="text-align:right">P.U.</th>
          <th style="text-align:right">Desc.</th>
          <th style="text-align:right">Importe</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatMoney(data.subtotal)}</span></div>
      <div class="row"><span>Descuentos</span><span>-${formatMoney(data.discountTotal)}</span></div>
      <div class="row grand"><span>TOTAL</span><span>${formatMoney(data.total)}</span></div>
    </div>
    <div style="margin-top:14px">
      <strong style="font-size:13px">Formas de pago</strong>
      ${paymentsHtml}
    </div>
    ${data.cancelReason ? `<p class="muted" style="margin-top:12px;text-align:left">Cancelación: ${escapeHtml(data.cancelReason)}</p>` : ""}
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(html);
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al generar ticket",
    });
  }
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Caja (Fase 2) ---

export const getPosCashStatus = async (req: Request, res: Response) => {
  try {
    const branchId = Number(req.query.branchId);
    const data = await getCashStatus(branchId);
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Error al consultar caja",
    });
  }
};

export const openPosCash = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const branchId = Number(req.body?.branchId);
    const openingFloat = Number(req.body?.openingFloat);
    const notes = req.body?.notes ? String(req.body.notes) : null;
    const data = await openCashSession({
      branchId,
      userId,
      openingFloat,
      notes,
    });
    return res.status(201).json({
      ok: true,
      message: "Caja abierta",
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo abrir caja",
    });
  }
};

export const addPosCashMovement = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const branchId = Number(req.body?.branchId);
    const type = String(req.body?.type || "") as "cash_in" | "cash_out";
    const amount = Number(req.body?.amount);
    const reason = req.body?.reason ? String(req.body.reason) : null;
    const data = await addManualCashMovement({
      branchId,
      userId,
      type,
      amount,
      reason,
    });
    return res.status(201).json({
      ok: true,
      message: type === "cash_in" ? "Entrada registrada" : "Salida registrada",
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo registrar el movimiento",
    });
  }
};

export const closePosCash = async (req: CustomRequestI, res: Response) => {
  try {
    const userId = Number(req.idUser);
    const branchId = Number(req.body?.branchId);
    const closingCounted = Number(req.body?.closingCounted);
    const notes = req.body?.notes ? String(req.body.notes) : null;
    const data = await closeCashSession({
      branchId,
      userId,
      closingCounted,
      notes,
    });
    return res.json({
      ok: true,
      message: "Corte de caja cerrado",
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo cerrar caja",
    });
  }
};

export const listPosCashSessions = async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 15;
    const result = await listCashSessions({ branchId, page, limit });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al listar sesiones de caja",
    });
  }
};

export const getPosCashSessionById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "ID inválido" });
    }
    const data = await getCashSessionById(id);
    if (!data) {
      return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    }
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al obtener sesión",
    });
  }
};

/** Ledger unificado web + POS (Fase 4). */
export const listInventoryMovements = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const productId = req.query.productId ? Number(req.query.productId) : null;
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const reason = req.query.reason ? String(req.query.reason) : null;

    const where: Prisma.inventory_movementsWhereInput = {};
    if (productId && Number.isSafeInteger(productId)) where.productId = productId;
    if (branchId && Number.isSafeInteger(branchId)) where.branchId = branchId;
    if (reason) where.reason = reason;

    const [total, rows] = await Promise.all([
      prisma.inventory_movements.count({ where }),
      prisma.inventory_movements.findMany({
        where,
        include: {
          products: { select: { name: true, sku: true } },
          branches: { select: { name: true, city: true } },
          users: { select: { name: true, lastname: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      ok: true,
      data: rows.map((m) => ({
        idInventoryMovement: Number(m.idInventoryMovement),
        productId: Number(m.productId),
        productName: m.products?.name || null,
        productSku: m.products?.sku || null,
        branchId: m.branchId != null ? Number(m.branchId) : null,
        branchName: m.branches?.name || null,
        userId: m.userId != null ? Number(m.userId) : null,
        userName: m.users
          ? `${m.users.name || ""} ${m.users.lastname || ""}`.trim()
          : null,
        delta: m.delta,
        reason: m.reason,
        refType: m.refType,
        refId: m.refId,
        note: m.note,
        createdAt: m.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al listar movimientos",
    });
  }
};

// --- Series / garantías (Fase 3) ---

export const searchPosSerials = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "");
    const data = await searchSerials(q);
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "Error al buscar series",
    });
  }
};

export const getPosSerial = async (req: Request, res: Response) => {
  try {
    const serial = String(req.params.serial || "");
    const data = await getSerialByNumber(serial);
    if (!data) {
      return res.status(404).json({ ok: false, message: "Serie no encontrada" });
    }
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error?.message || "Error al obtener serie",
    });
  }
};

export const markPosSerialRma = async (req: CustomRequestI, res: Response) => {
  try {
    const serialNumber = String(req.body?.serialNumber || req.params.serial || "");
    const notes = req.body?.notes ? String(req.body.notes) : null;
    const data = await markSerialRma({ serialNumber, notes });
    return res.json({ ok: true, message: "Serie marcada como RMA", data });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo marcar RMA",
    });
  }
};

export const registerPosSerial = async (req: CustomRequestI, res: Response) => {
  try {
    const productId = Number(req.body?.productId);
    const serialNumber = String(req.body?.serialNumber || "");
    const branchId = req.body?.branchId != null ? Number(req.body.branchId) : null;
    const notes = req.body?.notes ? String(req.body.notes) : null;
    const data = await registerAvailableSerial({
      productId,
      serialNumber,
      branchId,
      notes,
    });
    return res.status(201).json({
      ok: true,
      message: "Serie registrada como disponible",
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo registrar la serie",
    });
  }
};

export const updatePosProductSerialConfig = async (
  req: CustomRequestI,
  res: Response,
) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ ok: false, message: "Producto inválido" });
    }

    const hasCols = await productsHaveSerialColumns();
    if (!hasCols) {
      return res.status(400).json({
        ok: false,
        message:
          "Faltan columnas requiresSerial/warrantyMonths en products. Aplica la migración 20260908_pos_serial_columns.",
      });
    }

    const requiresSerial =
      req.body?.requiresSerial != null
        ? Boolean(req.body.requiresSerial)
        : undefined;
    const warrantyMonths =
      req.body?.warrantyMonths != null
        ? Number(req.body.warrantyMonths)
        : undefined;

    const data: Prisma.productsUpdateInput = {};
    if (requiresSerial !== undefined) data.requiresSerial = requiresSerial;
    if (warrantyMonths !== undefined) {
      if (!Number.isFinite(warrantyMonths) || warrantyMonths < 0) {
        return res.status(400).json({
          ok: false,
          message: "Meses de garantía inválidos",
        });
      }
      data.warrantyMonths = Math.floor(warrantyMonths);
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, message: "Nada que actualizar" });
    }

    const updated = await prisma.products.update({
      where: { idProduct: productId },
      data,
      select: {
        idProduct: true,
        name: true,
        requiresSerial: true,
        warrantyMonths: true,
      },
    });

    invalidatePosSearchCatalog();

    return res.json({
      ok: true,
      message: "Configuración de serie actualizada",
      data: {
        idProduct: Number(updated.idProduct),
        name: updated.name,
        requiresSerial: Boolean(updated.requiresSerial),
        warrantyMonths: updated.warrantyMonths,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      message: error?.message || "No se pudo actualizar el producto",
    });
  }
};
