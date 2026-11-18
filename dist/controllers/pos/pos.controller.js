"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePosProductSerialConfig = exports.registerPosSerial = exports.markPosSerialRma = exports.getPosSerial = exports.searchPosSerials = exports.listInventoryMovements = exports.listPosCashSessionMovements = exports.getPosCashSessionById = exports.listPosCashSessions = exports.closePosCash = exports.addPosCashMovement = exports.openPosCash = exports.getPosCashStatus = exports.getPosSaleWarrantySheet = exports.getPosSaleTicket = exports.cancelPosSale = exports.getPosSaleById = exports.listPosSales = exports.createPosSale = exports.searchPosCustomers = exports.getPosProductsState = exports.getPosProductCosts = exports.getPosQuoteByNumber = exports.getPosSaleByFolio = exports.searchPosProductsHandler = exports.listPosBranches = void 0;
const client_1 = require("@prisma/client");
const prismaClient_1 = require("../../db/prismaClient");
const pos_service_1 = require("../../services/pos/pos.service");
const posSerialFlags_service_1 = require("../../services/pos/posSerialFlags.service");
const posStock_service_1 = require("../../services/pos/posStock.service");
const posCash_service_1 = require("../../services/pos/posCash.service");
const quotePdfClient_service_1 = require("../../services/quotePdfClient.service");
const quoteLines_service_1 = require("../../services/quoteLines.service");
const posSerial_service_1 = require("../../services/pos/posSerial.service");
const posWarranty_service_1 = require("../../services/pos/posWarranty.service");
const pcinbox_pickup_constants_1 = require("../../constants/pcinbox-pickup.constants");
const pcinbox_branch_display_1 = require("../../constants/pcinbox-branch-display");
const posManualProduct_service_1 = require("../../services/pos/posManualProduct.service");
const posTicketHtml_service_1 = require("../../services/pos/posTicketHtml.service");
const posCost_service_1 = require("../../services/pos/posCost.service");
const index_service_1 = require("../../services/index.service");
const RESERVATION_REF_PATTERN = /^PCX-\d{3,6}-(PC|LP)$/i;
function parseServiceIntake(raw, fallbackServiceType) {
    if (!raw || typeof raw !== "object")
        return null;
    const src = raw;
    const equipmentRaw = Array.isArray(src.equipment) ? src.equipment : [];
    const equipment = [];
    for (const row of equipmentRaw.slice(0, 40)) {
        if (!row || typeof row !== "object")
            continue;
        const r = row;
        const description = String(r.description || "").trim().slice(0, 500);
        if (!description)
            continue;
        const quantity = Math.max(1, Math.min(999, Math.round(Number(r.quantity) || 1)));
        const serialNumber = String(r.serialNumber || "").trim().slice(0, 128);
        const physicalCondition = String(r.physicalCondition || "")
            .trim()
            .slice(0, 255);
        if (!physicalCondition)
            continue;
        equipment.push({
            quantity,
            description,
            serialNumber,
            physicalCondition,
        });
    }
    const failureOrRequestedService = String(src.failureOrRequestedService || "")
        .trim()
        .slice(0, 4000);
    const technicalObservationsOnReceipt = String(src.technicalObservationsOnReceipt || "")
        .trim()
        .slice(0, 4000);
    if (equipment.length < 1 || failureOrRequestedService.length < 2) {
        return null;
    }
    return {
        serviceType: String(src.serviceType || fallbackServiceType || "Servicio")
            .trim()
            .slice(0, 120) || "Servicio",
        equipment,
        failureOrRequestedService,
        technicalObservationsOnReceipt,
        ...(RESERVATION_REF_PATTERN.test(String(src.reservationReference || ""))
            ? {
                reservationReference: String(src.reservationReference)
                    .trim()
                    .toUpperCase(),
            }
            : {}),
    };
}
const PAYMENT_METHODS = new Set([
    "efectivo_sucursal",
    "tarjeta_sucursal",
    "tarjeta_credito_sucursal",
    "tarjeta_debito_sucursal",
    "transferencia_bancaria",
    "otro",
]);
function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v))
        return NaN;
    return (0, pos_service_1.roundMoney)(v);
}
/** Efectivo y «Otro» pueden exceder (cambio); tarjeta/transferencia no. */
function paymentAllowsChange(method) {
    return method === "efectivo_sucursal" || method === "otro";
}
/** Efectivo/Otro pueden exceder (cambio); tarjeta/transferencia no. */
function settlePosPayments(total, payments) {
    let nonCashSum = 0;
    let cashReceived = 0;
    for (const p of payments) {
        if (paymentAllowsChange(p.method)) {
            cashReceived = (0, pos_service_1.roundMoney)(cashReceived + p.amount);
        }
        else {
            nonCashSum = (0, pos_service_1.roundMoney)(nonCashSum + p.amount);
        }
    }
    const safeTotal = (0, pos_service_1.roundMoney)(Math.max(0, total));
    const nonCashOverpay = (0, pos_service_1.roundMoney)(Math.max(0, nonCashSum - safeTotal));
    const cashDue = (0, pos_service_1.roundMoney)(Math.max(0, safeTotal - Math.min(nonCashSum, safeTotal)));
    const changeDue = (0, pos_service_1.roundMoney)(Math.max(0, cashReceived - cashDue));
    const appliedCash = (0, pos_service_1.roundMoney)(Math.min(cashReceived, cashDue));
    const paidApplied = (0, pos_service_1.roundMoney)(Math.min(nonCashSum, safeTotal) + appliedCash);
    const remaining = (0, pos_service_1.roundMoney)(Math.max(0, safeTotal - paidApplied));
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
async function resolvePosRole(req) {
    if (req.posRole === "admin" || req.posRole === "support") {
        return req.posRole;
    }
    const userId = Number(req.idUser);
    const user = await prismaClient_1.prisma.users.findFirst({
        where: { idUser: userId, active: 1 },
        select: { role: true },
    });
    if (user?.role === "support")
        return "support";
    return "admin";
}
function calendarDateInMexicoCity(d) {
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
function assertPosCancelAllowed(role, sale) {
    if (role === "admin")
        return;
    if (sale.status === "pending_payment")
        return;
    if (sale.status === "completed") {
        const saleDay = calendarDateInMexicoCity(new Date(sale.createdAt));
        const today = calendarDateInMexicoCity(new Date());
        if (saleDay === today)
            return;
        throw new Error("Como soporte solo puedes cancelar ventas completadas del mismo día. Solicita a un administrador el override.");
    }
    throw new Error("No se puede cancelar esta venta con tu rol");
}
function firstProductImage(imageUrl) {
    if (!imageUrl)
        return null;
    if (typeof imageUrl === "string") {
        const t = imageUrl.trim();
        if (!t)
            return null;
        if (t.startsWith("[") || t.startsWith("{")) {
            try {
                return firstProductImage(JSON.parse(t));
            }
            catch {
                return t;
            }
        }
        return t;
    }
    if (Array.isArray(imageUrl)) {
        const first = imageUrl.find((x) => typeof x === "string" && String(x).trim());
        return first ? String(first) : null;
    }
    if (typeof imageUrl === "object") {
        const values = Object.values(imageUrl);
        const first = values.find((x) => typeof x === "string" && String(x).trim());
        return first ? String(first) : null;
    }
    return null;
}
/** `null` = sin envío. Objeto = dirección de usuario para domicilio. */
function parsePosDeliveryAddressInput(raw) {
    if (raw == null)
        return { ok: true, value: null };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, message: "La dirección de envío no es válida" };
    }
    const row = raw;
    const street = String(row.street || "").trim();
    const noExt = String(row.noExt || "").trim();
    const noInt = String(row.noInt || "").trim();
    const postalCode = String(row.postalCode || "").trim();
    const cologne = String(row.cologne || "").trim();
    const city = String(row.city || "").trim();
    const state = String(row.state || "").trim();
    const country = String(row.country || "").trim() || "México";
    const shippingRaw = String(row.shippingCost ?? "")
        .trim()
        .replace(/[$,\s]/g, "")
        .replace(",", ".");
    const shippingCost = shippingRaw === "" ? 0 : (0, pos_service_1.roundMoney)(Number(shippingRaw));
    if (!street ||
        street.length > 255 ||
        !noExt ||
        noExt.length > 10 ||
        noInt.length > 10 ||
        !/^\d{5}$/.test(postalCode) ||
        !cologne ||
        cologne.length > 100 ||
        !city ||
        city.length > 100 ||
        !state ||
        state.length > 100 ||
        !country ||
        country.length > 100 ||
        !Number.isFinite(shippingCost) ||
        shippingCost < 0 ||
        shippingCost > 999999.99) {
        return {
            ok: false,
            message: "Completa la dirección de envío a domicilio antes de cobrar",
        };
    }
    return {
        ok: true,
        value: {
            street,
            noExt,
            noInt: noInt || null,
            postalCode,
            cologne,
            city,
            state,
            country,
            shippingCost,
        },
    };
}
function readStoredDeliveryAddresses(events) {
    if (!Array.isArray(events))
        return [];
    for (const event of events) {
        const payload = event?.payload && typeof event.payload === "object"
            ? event.payload
            : null;
        if (!payload)
            continue;
        if (payload.deliveryAddresses != null) {
            const parsed = parsePosDeliveryAddressesInput(payload.deliveryAddresses);
            if (parsed.ok && parsed.value && parsed.value.length > 0) {
                return parsed.value;
            }
        }
        if (payload.deliveryAddress != null) {
            const parsed = parsePosDeliveryAddressInput(payload.deliveryAddress);
            if (parsed.ok && parsed.value)
                return [parsed.value];
        }
    }
    return [];
}
function parsePosDeliveryAddressesInput(raw) {
    if (raw == null)
        return { ok: true, value: null };
    const rows = Array.isArray(raw) ? raw : [raw];
    if (rows.length === 0)
        return { ok: true, value: null };
    if (rows.length > 10) {
        return { ok: false, message: "Máximo 10 domicilios por venta" };
    }
    const value = [];
    for (let index = 0; index < rows.length; index += 1) {
        const parsed = parsePosDeliveryAddressInput(rows[index]);
        if (!parsed.ok) {
            return {
                ok: false,
                message: `Domicilio ${index + 1}: ${parsed.message}`,
            };
        }
        if (parsed.value)
            value.push(parsed.value);
    }
    return { ok: true, value: value.length > 0 ? value : null };
}
function decimalOrNull(value) {
    if (value == null)
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function serializeSale(sale) {
    const costLines = (sale.items || []).map((it) => ({
        quantity: Number(it.quantity),
        lineTotal: Number(it.lineTotal) || 0,
        costUnit: decimalOrNull(it.costUnit),
        profitMarginUnit: decimalOrNull(it.profitMarginUnit),
        catalogPriceUnit: decimalOrNull(it.catalogPriceUnit),
    }));
    const items = (0, posSerial_service_1.mergeSharedBarcodeSerials)(sale.items || [], (0, posSerial_service_1.readSharedSerialGroups)(sale.events));
    const deliveryAddresses = readStoredDeliveryAddresses(sale.events);
    return {
        // Interno (inversión/margen). No usar en ticket ni hoja de garantía.
        costSummary: (0, posCost_service_1.summarizePosCosts)(costLines),
        idPosSale: Number(sale.idPosSale),
        folio: sale.folio,
        branchId: Number(sale.branchId),
        branchName: sale.branches?.name || null,
        branchCity: sale.branches?.city || null,
        branchDisplayName: (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(sale.branches?.name) || null,
        cashierUserId: Number(sale.cashierUserId),
        // Marca comercial fija en UI/tickets; el id real queda en cashierUserId.
        cashierName: "PCinBOX",
        customerUserId: sale.customerUserId ? Number(sale.customerUserId) : null,
        customerName: sale.customerName ||
            (sale.customer
                ? `${sale.customer.name || ""} ${sale.customer.lastname || ""}`.trim()
                : "") ||
            null,
        status: sale.status,
        subtotal: Number(sale.subtotal),
        discountTotal: Number(sale.discountTotal),
        total: Number(sale.total),
        notes: sale.notes,
        requiredFactura: Number(sale.requiredFactura) === 1 ? 1 : 0,
        deliveryAddresses,
        deliveryAddress: deliveryAddresses[0] || null,
        cancelReason: sale.cancelReason,
        cancelledAt: sale.cancelledAt,
        customerEmail: sale.customerEmail || null,
        customerPhone: sale.customerPhone || null,
        paymentLinkUrl: sale.paymentLinkUrl || null,
        checkoutLinkUrl: sale.checkoutLinkUrl || null,
        linkReferencia: sale.linkReferencia || null,
        idLinkPago: sale.idLinkPago != null ? Number(sale.idLinkPago) : null,
        cashSessionId: sale.cashSessionId != null ? Number(sale.cashSessionId) : null,
        quoteNumber: sale.quoteNumber || null,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        items: items.map((it, idx) => ({
            costUnit: costLines[idx].costUnit,
            profitMarginUnit: costLines[idx].profitMarginUnit,
            catalogPriceUnit: costLines[idx].catalogPriceUnit,
            idPosSaleItem: Number(it.idPosSaleItem),
            productId: Number(it.productId),
            branchId: it.branchId != null ? Number(it.branchId) : null,
            branchName: it.branches?.name || null,
            branchCity: it.branches?.city || null,
            branchLabel: it.branches
                ? (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(it.branches.name) ||
                    [it.branches.name, it.branches.city].filter(Boolean).join(" — ") ||
                    null
                : Number(it.products?.providerId) === 1
                    ? "PCinBOX-León"
                    : null,
            providerId: it.products?.providerId != null
                ? Number(it.products.providerId)
                : null,
            productName: it.productName,
            productSku: it.productSku,
            productUpc: it.productUpc,
            productImage: firstProductImage(it.products?.image_url),
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            discountPct: Number(it.discountPct),
            lineTotal: Number(it.lineTotal),
            serials: (it.serials || []).map((s) => ({
                idProductSerial: Number(s.idProductSerial),
                serialNumber: s.serialNumber,
                status: s.status,
                warrantyMonths: s.warrantyMonths,
                warrantyMode: s.warrantyMode ?? null,
                warrantyExpiresAt: s.warrantyExpiresAt,
            })),
            serviceIntake: it.serviceMetaJson ?? null,
        })),
        payments: (sale.payments || []).map((p) => ({
            idPosPayment: Number(p.idPosPayment),
            method: p.method,
            amount: Number(p.amount),
            reference: p.reference,
            createdAt: p.createdAt,
        })),
        events: (sale.events || []).map((e) => ({
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
            products: { select: { image_url: true, providerId: true } },
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
    events: { orderBy: { createdAt: "asc" }, take: 50 },
};
/** Listado historial: sin imágenes, seriales ni eventos (evita saturar con volumen). */
const saleListInclude = {
    branches: { select: { name: true, city: true } },
    cashier: { select: { name: true, lastname: true } },
    items: {
        select: {
            idPosSaleItem: true,
            productId: true,
            quantity: true,
            productName: true,
            unitPrice: true,
            lineTotal: true,
            discountPct: true,
            productSku: true,
            productUpc: true,
            branchId: true,
            serviceMetaJson: true,
            costUnit: true,
            profitMarginUnit: true,
            catalogPriceUnit: true,
        },
    },
    payments: {
        select: {
            idPosPayment: true,
            method: true,
            amount: true,
            reference: true,
            createdAt: true,
        },
    },
};
const listPosBranches = async (_req, res) => {
    try {
        const cashBranchId = await (0, pcinbox_pickup_constants_1.resolvePosCashBranchId)();
        const branches = await prismaClient_1.prisma.branches.findMany({
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
            const display = (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(b.name) ||
                [b.name, b.city].filter(Boolean).join(" — ") ||
                `Bodega ${b.idBranche}`;
            const label = [display, providerName].filter(Boolean).join(" · ") || display;
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
        const cashBranch = (cashBranchId
            ? mapped.find((b) => b.idBranche === cashBranchId)
            : null) ||
            (cashBranchId
                ? {
                    idBranche: cashBranchId,
                    name: "pcinbox",
                    city: null,
                    providerId: 1,
                    providerName: "PCinBOX",
                    label: "Bodega PCinBOX",
                    isCashPoint: true,
                }
                : null);
        return res.json({
            ok: true,
            data: mapped,
            cashBranchId: cashBranchId,
            cashBranch,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar bodegas",
        });
    }
};
exports.listPosBranches = listPosBranches;
const searchPosProductsHandler = async (req, res) => {
    try {
        const q = String(req.query.q || "");
        const data = await (0, pos_service_1.searchPosProducts)(q);
        return res.json({ ok: true, data });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al buscar productos",
        });
    }
};
exports.searchPosProductsHandler = searchPosProductsHandler;
function normalizePosFolioQuery(raw) {
    const trimmed = String(raw || "")
        .trim()
        .replace(/^#/, "")
        .replace(/^PV-/i, "");
    if (!trimmed)
        return [];
    const values = new Set([trimmed, `PV-${trimmed}`]);
    if (/^\d+$/.test(trimmed)) {
        const numeric = String(Number(trimmed));
        values.add(numeric);
        values.add(`PV-${numeric}`);
    }
    return [...values];
}
/** Venta de este POS, por folio, para rellenar Cobrar (series vacías). */
const getPosSaleByFolio = async (req, res) => {
    try {
        const candidates = normalizePosFolioQuery(String(req.params.folio || ""));
        if (!candidates.length) {
            return res.status(400).json({
                ok: false,
                code: "FOLIO_INVALID",
                message: "El folio está vacío o no se puede leer. Escribe solo el número de la venta POS, por ejemplo 3414, y vuelve a importar. Si se repite, reporta a soporte el texto que escribiste y la hora.",
            });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { folio: { in: candidates } },
            include: saleInclude,
        });
        if (!sale) {
            return res.status(404).json({
                ok: false,
                code: "FOLIO_NOT_FOUND",
                message: "No hay una venta de este punto de venta con ese folio. Revisa el número en Historial del POS. No uses un pedido de la tienda en línea. Si el folio sí existe y no carga, reporta a soporte el folio y la hora.",
            });
        }
        const serialized = serializeSale(sale);
        const catalogIds = (sale.items || [])
            .filter((item) => {
            const sku = String(item.productSku || "");
            return (sku !== posManualProduct_service_1.POS_MANUAL_PRODUCT_SKU && sku !== posManualProduct_service_1.POS_MANUAL_SERVICE_SKU);
        })
            .map((item) => Number(item.productId));
        const hydrated = await (0, pos_service_1.hydratePosProductsByIds)(catalogIds, {
            includeInactive: true,
        });
        const byId = new Map(hydrated.map((product) => [product.idProduct, product]));
        const items = (sale.items || []).map((item) => {
            const sku = String(item.productSku || "");
            const isService = sku === posManualProduct_service_1.POS_MANUAL_SERVICE_SKU;
            const isManual = isService || sku === posManualProduct_service_1.POS_MANUAL_PRODUCT_SKU;
            const product = byId.get(Number(item.productId));
            const serialRows = item.serials || [];
            const capturedSerials = serialRows
                .map((serial) => String(serial.serialNumber || "").trim())
                .filter((serial) => serial && !serial.startsWith("POS-W-"));
            const warrantySerial = serialRows.find((serial) => serial.warrantyMode) || serialRows[0];
            const storedMonths = item.warrantyMonths != null
                ? Number(item.warrantyMonths)
                : warrantySerial?.warrantyMonths != null
                    ? Number(warrantySerial.warrantyMonths)
                    : product?.warrantyMonths ?? null;
            const storedMode = item.warrantyMode ||
                warrantySerial?.warrantyMode ||
                product?.warrantyMode ||
                (storedMonths != null && storedMonths > 0
                    ? "months"
                    : isManual
                        ? "none"
                        : null);
            return {
                isManual,
                manualKind: isService ? "service" : "product",
                idProduct: Number(item.productId),
                productId: Number(item.productId),
                name: item.productName,
                sku: isManual ? null : item.productSku,
                upc: item.productUpc,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                discountPct: Number(item.discountPct),
                branchId: item.branchId != null ? Number(item.branchId) : null,
                serviceIntake: item.serviceMetaJson ?? null,
                serials: capturedSerials,
                requiresSerial: isManual ? false : Boolean(product?.requiresSerial),
                warrantyMonths: storedMonths,
                warrantyMode: storedMode,
                isPC: Boolean(product?.isPC),
                providerId: product?.providerId ?? null,
                stocksByBranch: product?.stocksByBranch || [],
                suggestedBranchId: item.branchId != null
                    ? Number(item.branchId)
                    : product?.suggestedBranchId ?? null,
                price: product?.price ?? Number(item.unitPrice),
                image_url: product?.image_url ?? null,
                inactive: !isManual && !product,
            };
        });
        return res.json({
            ok: true,
            data: {
                folio: serialized.folio,
                status: serialized.status,
                customerName: serialized.customerName,
                customerPhone: serialized.customerPhone,
                customerUserId: serialized.customerUserId,
                notes: serialized.notes,
                requiredFactura: serialized.requiredFactura === 1,
                deliveryAddresses: serialized.deliveryAddresses || [],
                deliveryAddress: serialized.deliveryAddress || null,
                payments: (serialized.payments || []).map((payment) => ({
                    method: payment.method,
                    amount: payment.amount,
                    reference: payment.reference || "",
                })),
                items,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message ||
                "No se pudo consultar el folio. Espera un momento y vuelve a intentar. Si se repite, reporta a soporte el folio y la hora.",
        });
    }
};
exports.getPosSaleByFolio = getPosSaleByFolio;
const POS_IMPORT_QTY_MAX = 1000;
/**
 * Cruza líneas guardadas con los precios del PDF.
 * Si hay productos sin catálogo, ensamble o varios equipos, no deja pasar
 * un total distinto al que se guardó en la cotización.
 */
function preparePosQuoteImport(input) {
    const equipos = input.equipos;
    const storedDeliveries = input.deliveries;
    const pdfShipping = input.pdfExtras.shipping;
    const hasShipping = storedDeliveries.length > 0 || pdfShipping.length > 0;
    const strict = input.lines.some((line) => line.manual) ||
        input.assemblyPrice != null ||
        input.pdfExtras.assemblyPrice != null ||
        hasShipping ||
        equipos > 1;
    const scaledByIndex = [];
    const manualItems = [];
    let onePcRaw = 0;
    const refuse = (message, status = 409) => ({
        ok: false,
        status,
        message,
    });
    const storedAssembly = input.assemblyPrice;
    const pdfAssembly = input.pdfExtras.assemblyPrice;
    if (storedAssembly != null || pdfAssembly != null) {
        if (storedAssembly == null ||
            pdfAssembly == null ||
            Math.abs(storedAssembly - pdfAssembly) > 0.009) {
            return refuse("El precio de ensamble de la cotización no coincide con el PDF. Genera la cotización de nuevo.");
        }
    }
    const assembly = storedAssembly;
    if (hasShipping) {
        if (storedDeliveries.length !== pdfShipping.length) {
            return refuse("Los envíos de la cotización no coinciden con el PDF. Genera la cotización de nuevo.");
        }
        for (let index = 0; index < storedDeliveries.length; index += 1) {
            const stored = storedDeliveries[index];
            const pdf = pdfShipping[index];
            if (!stored ||
                !pdf ||
                Math.abs(stored.shippingCost - pdf.shippingCost) > 0.009 ||
                (0, quoteLines_service_1.quotePublicShippingLabel)(stored) !== pdf.label) {
                return refuse("Un envío de la cotización no coincide con el PDF. Genera la cotización de nuevo.");
            }
        }
    }
    const shippingSum = (0, pos_service_1.roundMoney)(storedDeliveries.reduce((sum, row) => sum + row.shippingCost, 0));
    for (const line of input.lines) {
        const scaled = line.quantity * equipos;
        if (!Number.isInteger(scaled) || scaled < 1 || scaled > POS_IMPORT_QTY_MAX) {
            return refuse(`«${line.name || "Un producto"}» quedaría en ${scaled} piezas y el punto de venta permite hasta ${POS_IMPORT_QTY_MAX} por línea. Baja la cantidad o el número de equipos.`, 400);
        }
        scaledByIndex.push(scaled);
        if (line.manual) {
            const pdf = input.pdfExtras.manualById.get(line.productId);
            const storedName = String(line.name || "").trim();
            const storedUpc = line.upc || null;
            if (!pdf ||
                pdf.quantity !== line.quantity ||
                pdf.name !== storedName ||
                (pdf.upc || null) !== storedUpc) {
                return refuse(`El producto sin catálogo «${storedName || "sin nombre"}» no coincide con el PDF. Genera la cotización de nuevo.`);
            }
            if (pdf.unitPrice <= 0) {
                return refuse(`«${storedName}» está en $0 y el punto de venta no puede cobrarlo. Ponle precio y genera la cotización de nuevo.`, 400);
            }
            onePcRaw += pdf.unitPrice * line.quantity;
            manualItems.push({
                name: storedName,
                upc: storedUpc,
                quantity: scaled,
                unitPrice: pdf.unitPrice,
            });
            continue;
        }
        const price = input.catalogPrices.get(Number(line.productId));
        if (strict && (price == null || !Number.isFinite(price))) {
            return refuse("Falta el precio cotizado de un producto de catálogo. Genera la cotización de nuevo.");
        }
        if (price != null && Number.isFinite(price)) {
            onePcRaw += price * line.quantity;
        }
    }
    if (assembly != null)
        onePcRaw += assembly;
    if (strict) {
        const expected = (0, pos_service_1.roundMoney)((0, pos_service_1.roundMoney)(onePcRaw) * equipos + shippingSum);
        if (!Number.isFinite(input.totalAmount) || Math.abs(expected - input.totalAmount) > 0.009) {
            return refuse("El total de la cotización no cuadra con sus productos, el ensamble y los envíos. Genera la cotización de nuevo.");
        }
    }
    return {
        ok: true,
        scaledByIndex,
        manualItems,
        assembly: assembly != null ? { unitPrice: assembly, quantity: equipos } : null,
        deliveries: storedDeliveries,
    };
}
/** Carga una cotización web por número para rellenar el carrito POS. */
const getPosQuoteByNumber = async (req, res) => {
    try {
        const quoteNumber = String(req.params.quoteNumber || "")
            .trim()
            .replace(/^#/, "")
            .toUpperCase();
        if (!quoteLines_service_1.QUOTE_NUMBER_PATTERN.test(quoteNumber)) {
            return res.status(400).json({
                ok: false,
                code: "QUOTE_INVALID",
                message: "Número de cotización inválido",
            });
        }
        const quote = await prismaClient_1.prisma.cotizaciones.findFirst({
            where: { quoteNumber },
            select: {
                quoteNumber: true,
                totalAmount: true,
                itemCount: true,
                includeAssemblyService: true,
                expiresAt: true,
                createdAt: true,
                linesJson: true,
                storageKey: true,
                active: true,
                users: {
                    select: {
                        name: true,
                        lastname: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });
        if (!quote) {
            return res.status(404).json({
                ok: false,
                code: "QUOTE_NOT_FOUND",
                message: "No se encontró esa cotización. Puede que el número sea incorrecto, o que el PDF y sus productos ya se eliminaran automáticamente (se borran a los 5 días desde su creación). Pide al cliente una cotización nueva desde la tienda.",
            });
        }
        const expired = quote.expiresAt.getTime() < Date.now();
        const archived = quote.active !== 1;
        if (archived || expired) {
            return res.status(410).json({
                ok: false,
                code: "QUOTE_EXPIRED",
                message: "Esta cotización ya venció o fue archivada. Los PDF se eliminan automáticamente a los 5 días desde su creación, por lo que no se pueden cargar sus productos al POS. Solicita al cliente que genere una cotización nueva en la tienda.",
                data: {
                    quoteNumber: quote.quoteNumber,
                    createdAt: quote.createdAt,
                    expiresAt: quote.expiresAt,
                    archived,
                    expired,
                },
            });
        }
        const hasRawLines = quote.linesJson != null &&
            !(Array.isArray(quote.linesJson) && quote.linesJson.length === 0);
        const stored = (0, quoteLines_service_1.readStoredQuoteLinesPayload)(quote.linesJson);
        const lines = stored?.lines ?? null;
        if (!lines || !stored) {
            return res.status(400).json({
                ok: false,
                code: "QUOTE_NO_LINES",
                message: hasRawLines
                    ? "Esta cotización tiene líneas guardadas en un formato que el POS no puede leer. Pide al cliente regenerarla desde la tienda."
                    : "Esta cotización no tiene productos guardados para el POS (cotizaciones anteriores a la vinculación con caja). Pide al cliente regenerarla desde la tienda; las nuevas sí incluyen las líneas.",
            });
        }
        const equipos = stored.equipmentCount;
        const catalogLines = lines.filter((line) => !line.manual);
        const productIds = catalogLines.map((line) => Number(line.productId));
        const hydrated = await (0, pos_service_1.hydratePosProductsByIds)(productIds);
        const byId = new Map(hydrated.map((p) => [p.idProduct, p]));
        // Precios cotizados: Keywords del PDF (no linesJson / DB).
        const [quotePricesByProductId, pdfExtras] = await Promise.all([
            (0, quotePdfClient_service_1.readQuotePdfLinePrices)(quote.storageKey),
            (0, quotePdfClient_service_1.readQuotePdfSaleExtras)(quote.storageKey),
        ]);
        const prepared = preparePosQuoteImport({
            lines,
            equipos,
            assemblyPrice: stored.assemblyPrice,
            deliveries: stored.deliveries,
            totalAmount: Number(quote.totalAmount),
            catalogPrices: quotePricesByProductId,
            pdfExtras,
        });
        if (!prepared.ok) {
            return res.status(prepared.status).json({
                ok: false,
                code: "QUOTE_MISMATCH",
                message: prepared.message,
            });
        }
        const items = [];
        const unresolvedIds = [];
        const unresolvedIdStr = [];
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            if (!line || line.manual)
                continue;
            const pid = Number(line.productId);
            const product = byId.get(pid);
            if (!product || !Number.isSafeInteger(pid)) {
                if (Number.isSafeInteger(pid) && pid > 0) {
                    unresolvedIds.push(pid);
                    unresolvedIdStr.push(String(line.productId));
                }
                else {
                    unresolvedIdStr.push(String(line.productId));
                }
                continue;
            }
            let suggestedBranchId = product.suggestedBranchId ?? null;
            if (line.storeId != null &&
                product.stocksByBranch.some((s) => s.branchId === line.storeId)) {
                suggestedBranchId = line.storeId;
            }
            items.push({
                ...product,
                suggestedBranchId,
                quantity: prepared.scaledByIndex[index] ?? line.quantity,
                quoteStoreId: line.storeId,
                quoteUnitPrice: quotePricesByProductId.get(pid) ?? null,
            });
        }
        const uniqueUnresolved = [...new Set(unresolvedIds)];
        const inactiveRows = uniqueUnresolved.length > 0
            ? await prismaClient_1.prisma.products.findMany({
                where: {
                    idProduct: { in: uniqueUnresolved },
                    NOT: { active: 1 },
                },
                select: {
                    idProduct: true,
                    name: true,
                    sku: true,
                    upc: true,
                    price: true,
                },
            })
            : [];
        const inactiveHydrated = inactiveRows.length > 0
            ? await (0, pos_service_1.hydratePosProductsByIds)(inactiveRows.map((p) => Number(p.idProduct)), { includeInactive: true })
            : [];
        const inactiveHydratedById = new Map(inactiveHydrated.map((p) => [p.idProduct, p]));
        const quotedQtyById = new Map();
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            if (!line || line.manual)
                continue;
            const pid = Number(line.productId);
            if (!Number.isSafeInteger(pid))
                continue;
            quotedQtyById.set(pid, (quotedQtyById.get(pid) || 0) + (prepared.scaledByIndex[index] || 0));
        }
        const inactiveProducts = inactiveRows.map((p) => {
            const pid = Number(p.idProduct);
            const full = inactiveHydratedById.get(pid);
            return {
                idProduct: pid,
                name: String(p.name || `Producto #${p.idProduct}`),
                sku: p.sku ?? null,
                upc: p.upc ?? null,
                price: Number(p.price) || 0,
                quantity: Math.max(1, Math.round(quotedQtyById.get(pid) || 1)),
                quoteUnitPrice: quotePricesByProductId.get(pid) ?? null,
                providerId: full?.providerId ?? null,
                isPC: full?.isPC ?? false,
                warrantyMonths: full?.warrantyMonths ?? null,
                warrantyMode: full?.warrantyMode ?? null,
                image_url: full?.image_url ?? null,
            };
        });
        const inactiveIdSet = new Set(inactiveProducts.map((p) => p.idProduct));
        const missingProductIds = unresolvedIdStr.filter((idStr) => {
            const n = Number(idStr);
            return !(Number.isSafeInteger(n) && inactiveIdSet.has(n));
        });
        const mustMatchQuote = prepared.manualItems.length > 0 ||
            prepared.assembly != null ||
            prepared.deliveries.length > 0 ||
            equipos > 1;
        if (mustMatchQuote && missingProductIds.length > 0) {
            return res.status(409).json({
                ok: false,
                code: "QUOTE_MISMATCH",
                message: "Un producto de catálogo de esta cotización ya no existe. No se importó nada para no descuadrar el total. Genera la cotización de nuevo.",
            });
        }
        // Cliente del POS: solo lo capturado en el PDF (sin rellenar con users.phone).
        const pdfClient = await (0, quotePdfClient_service_1.readQuotePdfClientIdentity)(quote.storageKey);
        const customer = (0, quotePdfClient_service_1.resolvePosCustomerFromPdf)(pdfClient);
        return res.json({
            ok: true,
            data: {
                quoteNumber: quote.quoteNumber,
                totalAmount: Number(quote.totalAmount),
                itemCount: quote.itemCount,
                includeAssemblyService: quote.includeAssemblyService,
                equipmentCount: equipos,
                expired: false,
                expiresAt: quote.expiresAt,
                createdAt: quote.createdAt,
                customer,
                items,
                manualItems: prepared.manualItems,
                assembly: prepared.assembly,
                deliveries: prepared.deliveries,
                comments: stored.comments || "",
                missingProductIds,
                inactiveProducts,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al consultar la cotización",
        });
    }
};
exports.getPosQuoteByNumber = getPosQuoteByNumber;
/** Costos internos por producto (proveedores 2/3) para el resumen del carrito. */
const getPosProductCosts = async (req, res) => {
    try {
        const ids = String(req.query.ids || "")
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isSafeInteger(n) && n > 0)
            .slice(0, 200);
        const [costs, providerIds] = await Promise.all([
            (0, posCost_service_1.loadPosUnitCostsByProductIds)(ids),
            (0, posCost_service_1.loadPosCostProviderProductIds)(ids),
        ]);
        return res.json({
            ok: true,
            data: [...costs.entries()].map(([productId, cost]) => ({
                productId,
                ...cost,
            })),
            missingProductIds: ids.filter((id) => providerIds.has(id) && !costs.has(id)),
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al consultar costos",
        });
    }
};
exports.getPosProductCosts = getPosProductCosts;
/**
 * Estado actual (activo, precio, stock por bodega) de productos del carrito,
 * incluidos los inactivos. El POS lo consulta justo antes de cobrar.
 */
const getPosProductsState = async (req, res) => {
    try {
        const ids = [
            ...new Set(String(req.query.ids || "")
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isSafeInteger(n) && n > 0)),
        ].slice(0, 200);
        if (ids.length === 0)
            return res.json({ ok: true, data: [] });
        const [hydrated, activeRows] = await Promise.all([
            (0, pos_service_1.hydratePosProductsByIds)(ids, { includeInactive: true }),
            prismaClient_1.prisma.products.findMany({
                where: { idProduct: { in: ids } },
                select: { idProduct: true, active: true },
            }),
        ]);
        const activeById = new Map(activeRows.map((row) => [Number(row.idProduct), Number(row.active) === 1]));
        return res.json({
            ok: true,
            data: hydrated.map((p) => ({
                productId: p.idProduct,
                active: activeById.get(p.idProduct) === true,
                name: p.name,
                price: p.price,
                stockGlobal: p.stockGlobal,
                stocksByBranch: p.stocksByBranch,
                imageUrl: p.image_url ?? null,
                providerId: p.providerId,
            })),
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al consultar el estado de los productos",
        });
    }
};
exports.getPosProductsState = getPosProductsState;
const searchPosCustomers = async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 2) {
            return res.json({ ok: true, data: [] });
        }
        const or = [];
        if (q.includes("@")) {
            or.push({ email: { startsWith: q } });
        }
        else if (/^\+?\d[\d\s-]{5,}$/.test(q)) {
            const digits = q.replace(/\D/g, "");
            or.push({ phone: { contains: digits.slice(-10) } });
            if (digits.length >= 6)
                or.push({ phone: { startsWith: digits } });
        }
        else {
            or.push({ name: { startsWith: q } }, { lastname: { startsWith: q } });
            if (q.length >= 3) {
                or.push({ email: { startsWith: q } });
            }
        }
        const users = await prismaClient_1.prisma.users.findMany({
            where: {
                active: 1,
                role: "customer",
                OR: or,
            },
            take: 20,
            orderBy: [{ name: "asc" }, { lastname: "asc" }],
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al buscar clientes",
        });
    }
};
exports.searchPosCustomers = searchPosCustomers;
const createPosSale = async (req, res) => {
    try {
        const cashierUserId = Number(req.idUser);
        if (!Number.isSafeInteger(cashierUserId) || cashierUserId <= 0) {
            return res.status(401).json({ ok: false, message: "Sesión inválida" });
        }
        const rawIdempotency = req.body?.idempotencyKey ??
            req.headers["idempotency-key"] ??
            req.headers["Idempotency-Key"];
        const idempotencyKey = String(Array.isArray(rawIdempotency) ? rawIdempotency[0] : rawIdempotency || "").trim();
        if (idempotencyKey &&
            !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
            return res.status(400).json({
                ok: false,
                message: "Clave de idempotencia inválida",
            });
        }
        if (idempotencyKey) {
            const existing = await prismaClient_1.prisma.pos_sales.findFirst({
                where: { idempotencyKey },
                include: saleInclude,
            });
            if (existing) {
                if (Number(existing.cashierUserId) !== cashierUserId) {
                    return res.status(409).json({
                        ok: false,
                        message: "Esa clave de cobro ya fue usada por otra sesión",
                    });
                }
                return res.status(200).json({
                    ok: true,
                    message: "Venta ya registrada (reintento seguro)",
                    alreadyProcessed: true,
                    data: serializeSale(existing),
                });
            }
        }
        const { branchId, customerUserId, customerName, customerEmail, customerPhone, notes, requiredFactura: rawRequiredFactura, items, payments, quoteNumber: rawQuoteNumber, sourceFolio: rawSourceFolio, reservationReference: rawReservationReference, } = req.body || {};
        const reservationReference = RESERVATION_REF_PATTERN.test(String(rawReservationReference || ""))
            ? String(rawReservationReference).trim().toUpperCase()
            : "";
        const requiredFactura = rawRequiredFactura === true ||
            rawRequiredFactura === 1 ||
            rawRequiredFactura === "1"
            ? 1
            : 0;
        const parsedDelivery = parsePosDeliveryAddressesInput(req.body?.deliveryAddresses ?? req.body?.deliveryAddress);
        if (!parsedDelivery.ok) {
            return res.status(400).json({
                ok: false,
                message: parsedDelivery.message,
            });
        }
        const deliveryAddresses = parsedDelivery.value;
        const quoteNumberNormalized = String(rawQuoteNumber || "")
            .trim()
            .replace(/^#/, "")
            .toUpperCase();
        let quoteNumber = null;
        if (quoteNumberNormalized) {
            if (!quoteLines_service_1.QUOTE_NUMBER_PATTERN.test(quoteNumberNormalized)) {
                return res.status(400).json({
                    ok: false,
                    message: "Número de cotización inválido",
                });
            }
            quoteNumber = quoteNumberNormalized;
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ ok: false, message: "Agrega al menos un producto" });
        }
        if (items.length > 100) {
            return res.status(400).json({
                ok: false,
                message: "Máximo 100 líneas por venta",
            });
        }
        if (!Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ ok: false, message: "Registra al menos una forma de pago" });
        }
        const posRole = await resolvePosRole(req);
        const isAdmin = posRole === "admin";
        /** Precios unitarios de la cotización (desde Keywords del PDF). */
        let quoteUnitPriceByProductId = new Map();
        let linkedQuoteLines = null;
        if (quoteNumber) {
            const linkedQuote = await prismaClient_1.prisma.cotizaciones.findFirst({
                where: { quoteNumber, active: 1 },
                select: {
                    quoteNumber: true,
                    expiresAt: true,
                    linesJson: true,
                    storageKey: true,
                },
            });
            if (!linkedQuote) {
                return res.status(400).json({
                    ok: false,
                    code: "QUOTE_NOT_FOUND",
                    message: "La cotización vinculada no existe o fue archivada. Quita el vínculo o carga una cotización vigente.",
                });
            }
            if (linkedQuote.expiresAt.getTime() < Date.now()) {
                return res.status(400).json({
                    ok: false,
                    code: "QUOTE_EXPIRED",
                    message: "La cotización vinculada ya venció (retención 5 días). Quita el vínculo o pide una cotización nueva.",
                });
            }
            linkedQuoteLines = (0, quoteLines_service_1.parseStoredQuoteLines)(linkedQuote.linesJson);
            if (!linkedQuoteLines) {
                return res.status(400).json({
                    ok: false,
                    code: "QUOTE_NO_LINES",
                    message: "La cotización vinculada no tiene líneas válidas. Regenera la cotización en la tienda.",
                });
            }
            quoteUnitPriceByProductId = await (0, quotePdfClient_service_1.readQuotePdfLinePrices)(linkedQuote.storageKey);
        }
        let folioBuckets = [];
        const sourceFolio = normalizePosFolioQuery(String(rawSourceFolio || ""))[0] || "";
        if (String(rawSourceFolio || "").trim()) {
            const candidates = normalizePosFolioQuery(String(rawSourceFolio));
            const sourceSale = await prismaClient_1.prisma.pos_sales.findFirst({
                where: { folio: { in: candidates } },
                select: {
                    folio: true,
                    items: {
                        select: { productId: true, unitPrice: true, quantity: true, productSku: true },
                    },
                },
            });
            if (!sourceSale) {
                return res.status(404).json({
                    ok: false,
                    message: "No hay una venta de este punto de venta con ese folio. Quita el folio, confirma el número en Historial e impórtalo otra vez. Si se repite, reporta a soporte el folio y la hora.",
                });
            }
            folioBuckets = sourceSale.items
                .filter((item) => {
                const sku = String(item.productSku || "");
                return sku !== posManualProduct_service_1.POS_MANUAL_PRODUCT_SKU && sku !== posManualProduct_service_1.POS_MANUAL_SERVICE_SKU;
            })
                .map((item) => ({
                productId: Number(item.productId),
                unitPrice: (0, pos_service_1.roundMoney)(Number(item.unitPrice)),
                quantityLeft: Number(item.quantity),
            }));
        }
        const normalizedItems = [];
        let subtotal = 0;
        let discountTotal = 0;
        const allSerials = [];
        const priceOverrides = [];
        for (const raw of items) {
            const quantity = Number(raw.quantity);
            const discountPct = Number(raw.discountPct ?? 0);
            const itemBranchId = raw.branchId != null && raw.branchId !== ""
                ? Number(raw.branchId)
                : null;
            const isManual = Boolean(raw.manual) ||
                String(raw.productId || "").toLowerCase() === "manual";
            if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ ok: false, message: "Cantidad inválida" });
            }
            if (quantity > 1000) {
                return res.status(400).json({
                    ok: false,
                    message: "Cantidad máxima por línea: 1000",
                });
            }
            try {
                (0, pos_service_1.assertDiscountAllowed)(discountPct, isAdmin);
            }
            catch (e) {
                return res.status(403).json({ ok: false, message: e.message });
            }
            if (isManual) {
                const manualKindRaw = String(raw.manualKind || raw.lineKind || "")
                    .trim()
                    .toLowerCase();
                const manualKind = manualKindRaw === "service" || manualKindRaw === "servicio"
                    ? "service"
                    : "product";
                const manualName = String(raw.name || raw.productName || "").trim();
                if (manualName.length < 2) {
                    return res.status(400).json({
                        ok: false,
                        message: manualKind === "service"
                            ? "El servicio necesita un nombre (mín. 2 caracteres)"
                            : "El producto manual necesita un nombre",
                    });
                }
                const unitPrice = money(raw.unitPrice);
                if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
                    return res.status(400).json({
                        ok: false,
                        message: `Precio unitario inválido para «${manualName}» (debe ser mayor a 0)`,
                    });
                }
                const manualProduct = await (0, posManualProduct_service_1.ensurePosManualLineProduct)(manualKind);
                const requireSerialManual = manualKind === "service" ? false : Boolean(raw.requiresSerial);
                let serials = [];
                try {
                    serials = (0, posSerial_service_1.normalizeItemSerials)(quantity, requireSerialManual, raw.serials, manualName, [raw.upc]);
                }
                catch (e) {
                    return res.status(400).json({ ok: false, message: e.message });
                }
                const modeRaw = String(raw.warrantyMode || "").trim();
                if (!modeRaw) {
                    return res.status(400).json({
                        ok: false,
                        message: `Elige la garantía de «${manualName}» (meses, años, no aplica o centro de servicio)`,
                    });
                }
                let resolvedManualWarranty;
                try {
                    resolvedManualWarranty = (0, posWarranty_service_1.fromCashierWarranty)({
                        warrantyMode: raw.warrantyMode,
                        warrantyMonths: raw.warrantyMonths,
                        warrantyUnit: raw.warrantyUnit,
                    });
                }
                catch (e) {
                    return res.status(400).json({
                        ok: false,
                        message: `${manualName}: ${e.message || "Garantía inválida"}`,
                    });
                }
                const warrantyMonths = resolvedManualWarranty.warrantyMonths;
                const warrantyMode = resolvedManualWarranty.warrantyMode;
                const lineBase = (0, pos_service_1.roundMoney)(unitPrice * quantity);
                const lineTotal = (0, pos_service_1.computeLineTotal)(unitPrice, quantity, discountPct);
                subtotal = (0, pos_service_1.roundMoney)(subtotal + lineBase);
                discountTotal = (0, pos_service_1.roundMoney)(discountTotal + (lineBase - lineTotal));
                allSerials.push(...serials);
                const skuFromClient = String(raw.sku || "").trim().slice(0, 255);
                let serviceMetaJson = null;
                if (manualKind === "service") {
                    serviceMetaJson = parseServiceIntake(raw.serviceIntake ?? raw.serviceMeta, manualName);
                    if (!serviceMetaJson) {
                        return res.status(400).json({
                            ok: false,
                            message: "El servicio requiere datos del equipo (tabla) y la falla o servicio solicitado.",
                        });
                    }
                    if (reservationReference) {
                        serviceMetaJson = {
                            ...serviceMetaJson,
                            reservationReference,
                        };
                    }
                }
                normalizedItems.push({
                    productId: Number(manualProduct.idProduct),
                    branchId: null,
                    quantity,
                    unitPrice,
                    discountPct: (0, pos_service_1.roundMoney)(discountPct),
                    lineTotal,
                    productName: manualName.slice(0, 255),
                    productSku: skuFromClient ||
                        (manualKind === "service"
                            ? posManualProduct_service_1.POS_MANUAL_SERVICE_SKU
                            : posManualProduct_service_1.POS_MANUAL_PRODUCT_SKU),
                    productUpc: manualKind === "service"
                        ? null
                        : String(raw.upc || "").trim().slice(0, 255) || null,
                    serials,
                    warrantyMonths,
                    warrantyMode,
                    requiresSerial: requireSerialManual || serials.length > 0,
                    isManual: true,
                    providerId: null,
                    serviceMetaJson,
                    skipStock: true,
                    costSourceProductId: manualKind === "product" &&
                        Number.isSafeInteger(Number(raw.sourceProductId)) &&
                        Number(raw.sourceProductId) > 0
                        ? Number(raw.sourceProductId)
                        : null,
                });
                continue;
            }
            const productId = Number(raw.productId);
            if (!Number.isSafeInteger(productId) || productId <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: sourceFolio
                        ? `Una línea del folio ${sourceFolio} llegó sin identificador de producto. Pulsa «Quitar folio», impórtalo de nuevo y captura las series. Si vuelve a salir, reporta a soporte el folio y la hora.`
                        : "Hay un producto en el carrito sin identificador válido. Quita esa línea y agrégala otra vez desde el catálogo. Si se repite, reporta a soporte el nombre del producto y la hora.",
                });
            }
            const product = await prismaClient_1.prisma.products.findFirst({
                where: raw.useSourcePrice
                    ? { idProduct: productId }
                    : { idProduct: productId, active: 1 },
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
                const rawName = String(raw.name || "").trim();
                return res.status(404).json({
                    ok: false,
                    code: sourceFolio ? undefined : "POS_PRODUCT_UNAVAILABLE",
                    message: sourceFolio
                        ? `El producto ${productId} del folio ${sourceFolio} ya no está en el catálogo y no se pudo cobrar. Reporta a soporte el folio, el id ${productId} y la hora.`
                        : `«${rawName || `Producto ${productId}`}» ya no está activo en el catálogo. Pulsa «Cobrar» de nuevo para revisar el carrito: podrás quitarlo o agregarlo como captura manual.`,
                });
            }
            let skipStock = false;
            let folioUnitPrice = null;
            if (raw.useSourcePrice) {
                if (!sourceFolio) {
                    return res.status(400).json({
                        ok: false,
                        message: `Hay precios tomados de un folio, pero el folio no llegó al cobro. Pulsa «Quitar folio», impórtalo de nuevo y cobra sin agregar productos del catálogo. Si se repite, reporta a soporte la hora.`,
                    });
                }
                const requested = money(raw.unitPrice);
                const bucket = folioBuckets.find((row) => row.productId === productId &&
                    row.quantityLeft >= quantity &&
                    Number.isFinite(requested) &&
                    Math.abs(row.unitPrice - requested) <= 0.009);
                if (!bucket) {
                    return res.status(400).json({
                        ok: false,
                        message: `«${product.name}» no coincide en cantidad o precio con el folio ${sourceFolio}. No cambies la cantidad ni el precio de las líneas importadas: quita el folio, impórtalo de nuevo y captura solo las series. Si ya lo hiciste y sigue igual, reporta a soporte el folio y el nombre del producto.`,
                    });
                }
                bucket.quantityLeft -= quantity;
                folioUnitPrice = bucket.unitPrice;
                // La venta original ya descontó el stock. Este cobro solo captura series.
                skipStock = true;
            }
            const serialFlags = await (0, pos_service_1.getProductSerialFlags)(productId);
            const productProviderId = Number(product.providerId);
            let resolvedWarranty;
            try {
                resolvedWarranty = (0, posWarranty_service_1.resolvePosLineWarranty)({
                    providerId: productProviderId,
                    isPC: serialFlags.isPC,
                    catalogMode: serialFlags.warrantyMode,
                    catalogMonths: serialFlags.warrantyMonths,
                    clientMode: raw.warrantyMode,
                    clientMonths: raw.warrantyMonths,
                    clientUnit: raw.warrantyUnit,
                    requireCashierChoice: true,
                });
            }
            catch (e) {
                return res.status(400).json({
                    ok: false,
                    message: `${product.name}: ${e.message || "Garantía inválida"}`,
                });
            }
            const providerBranches = await prismaClient_1.prisma.branches.findMany({
                where: { providerId: product.providerId },
                select: { idBranche: true, name: true },
            });
            const sellableBranches = providerBranches.filter((b) => (0, pcinbox_branch_display_1.isPosSellableBranchName)(productProviderId, b.name));
            const providerBranchIds = new Set(sellableBranches.map((b) => Number(b.idBranche)));
            const stockRows = await prismaClient_1.prisma.product_stock.findMany({
                where: { productId },
                select: { branchId: true, stock: true },
            });
            const sellableStockRows = stockRows.filter((row) => providerBranchIds.has(Number(row.branchId)));
            const requiresBranchPicker = providerBranchIds.size > 0;
            let resolvedBranchId = itemBranchId;
            const tracksStock = productProviderId === posStock_service_1.POS_STOCK_PROVIDER_ID;
            if (requiresBranchPicker) {
                if (resolvedBranchId == null ||
                    !Number.isSafeInteger(resolvedBranchId) ||
                    resolvedBranchId <= 0) {
                    return res.status(400).json({
                        ok: false,
                        message: `Elige bodega para: ${product.name}`,
                    });
                }
                if (!providerBranchIds.has(resolvedBranchId)) {
                    return res.status(400).json({
                        ok: false,
                        message: `Bodega no válida para: ${product.name}`,
                    });
                }
                // Todos los proveedores: el POS no vende más de lo que muestra en la bodega.
                const stockRow = sellableStockRows.find((r) => Number(r.branchId) === resolvedBranchId);
                const available = stockRow != null
                    ? Number(stockRow.stock)
                    : // sin fila product_stock: no hay existencia por bodega
                        0;
                if (!skipStock && available < quantity) {
                    return res.status(400).json({
                        ok: false,
                        code: "POS_STOCK_CHANGED",
                        message: `Stock insuficiente en bodega para: ${product.name} (disp. ${Math.max(0, available)}). Pulsa «Cobrar» de nuevo para revisar el carrito.`,
                    });
                }
            }
            else {
                // Provider 1 / sin bodegas vendibles: stock global, sin branchId.
                resolvedBranchId = null;
                if (!skipStock && tracksStock && Number(product.stock) < quantity) {
                    return res.status(400).json({
                        ok: false,
                        code: "POS_STOCK_CHANGED",
                        message: `Stock insuficiente para: ${product.name}. Pulsa «Cobrar» de nuevo para revisar el carrito.`,
                    });
                }
            }
            const catalogPrice = money(product.price);
            const requestedPrice = raw.unitPrice != null && Number.isFinite(Number(raw.unitPrice))
                ? money(raw.unitPrice)
                : catalogPrice;
            let unitPrice = catalogPrice;
            let priceOverride = false;
            let overrideSource;
            const quoteStoredPrice = quoteUnitPriceByProductId.get(productId);
            const wantsQuotePrice = Boolean(raw.useQuotePrice);
            if (folioUnitPrice != null) {
                unitPrice = folioUnitPrice;
                priceOverride = Math.abs(folioUnitPrice - catalogPrice) > 0.009;
                if (priceOverride)
                    overrideSource = "folio";
            }
            else if (wantsQuotePrice) {
                if (quoteStoredPrice == null || !Number.isFinite(quoteStoredPrice)) {
                    return res.status(400).json({
                        ok: false,
                        message: `La cotización no tiene precio guardado para: ${product.name}. Usa el precio actual o regenera la cotización.`,
                    });
                }
                if (Math.abs(requestedPrice - quoteStoredPrice) > 0.009) {
                    return res.status(400).json({
                        ok: false,
                        message: `El precio cotizado no coincide para: ${product.name}`,
                    });
                }
                unitPrice = quoteStoredPrice;
                priceOverride = Math.abs(quoteStoredPrice - catalogPrice) > 0.009;
                if (priceOverride)
                    overrideSource = "quote";
            }
            else if (isAdmin &&
                Boolean(raw.priceOverride) &&
                Number.isFinite(requestedPrice) &&
                requestedPrice >= 0) {
                unitPrice = requestedPrice;
                priceOverride = Math.abs(requestedPrice - catalogPrice) > 0.009;
                if (priceOverride)
                    overrideSource = "admin";
            }
            else if (Math.abs(requestedPrice - catalogPrice) > 0.009) {
                // Cobrar otro precio en silencio descuadra el total que vio el cajero.
                return res.status(409).json({
                    ok: false,
                    code: "POS_PRICE_CHANGED",
                    message: `El precio de «${product.name}» cambió: en el carrito ${requestedPrice.toFixed(2)}, ahora ${catalogPrice.toFixed(2)}. Pulsa «Cobrar» de nuevo para actualizar el carrito y revisar los pagos.`,
                });
            }
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                return res.status(400).json({ ok: false, message: "Precio inválido" });
            }
            if (priceOverride) {
                priceOverrides.push({
                    productId,
                    catalogPrice,
                    unitPrice,
                    ...(overrideSource ? { source: overrideSource } : {}),
                });
            }
            let serials = [];
            try {
                serials = (0, posSerial_service_1.normalizeItemSerials)(quantity, Boolean(serialFlags.requiresSerial), raw.serials, product.name, [product.upc]);
            }
            catch (e) {
                return res.status(400).json({ ok: false, message: e.message });
            }
            allSerials.push(...serials);
            const lineBase = (0, pos_service_1.roundMoney)(unitPrice * quantity);
            const lineTotal = (0, pos_service_1.computeLineTotal)(unitPrice, quantity, discountPct);
            subtotal = (0, pos_service_1.roundMoney)(subtotal + lineBase);
            discountTotal = (0, pos_service_1.roundMoney)(discountTotal + (lineBase - lineTotal));
            normalizedItems.push({
                productId,
                branchId: resolvedBranchId,
                quantity,
                unitPrice,
                discountPct: (0, pos_service_1.roundMoney)(discountPct),
                lineTotal,
                productName: product.name,
                productSku: product.sku,
                productUpc: product.upc,
                serials,
                warrantyMonths: resolvedWarranty.warrantyMonths,
                warrantyMode: resolvedWarranty.warrantyMode,
                requiresSerial: Boolean(serialFlags.requiresSerial),
                isManual: false,
                providerId: productProviderId,
                serviceMetaJson: null,
                skipStock,
                costSourceProductId: (0, posCost_service_1.isPosCostProvider)(productProviderId)
                    ? productId
                    : null,
            });
        }
        const serialUpper = allSerials.map((s) => s.toUpperCase());
        if (new Set(serialUpper).size !== serialUpper.length) {
            return res.status(400).json({
                ok: false,
                message: "Hay series repetidas entre distintos productos de esta venta. Cada pieza necesita una serie distinta. Corrige los campos y vuelve a cobrar. Si se repite, reporta a soporte las series y el folio.",
            });
        }
        const shippingCost = (0, pos_service_1.roundMoney)((deliveryAddresses || []).reduce((sum, address) => sum + address.shippingCost, 0));
        const total = (0, pos_service_1.roundMoney)(subtotal - discountTotal + shippingCost);
        const unitCostsByProductId = await (0, posCost_service_1.loadPosUnitCostsByProductIds)(normalizedItems
            .map((it) => it.costSourceProductId)
            .filter((id) => id != null));
        const normalizedPayments = [];
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
            const referenceRaw = raw.reference
                ? String(raw.reference).trim().slice(0, 255)
                : "";
            if (method === "otro" && referenceRaw.length < 2) {
                return res.status(400).json({
                    ok: false,
                    message: "En forma de pago «Otro» indica el método (mín. 2 caracteres)",
                });
            }
            normalizedPayments.push({
                method,
                amount,
                reference: referenceRaw || null,
            });
        }
        const settlement = settlePosPayments(total, normalizedPayments);
        if (settlement.nonCashOverpay > 0.009) {
            return res.status(400).json({
                ok: false,
                message: "Tarjeta/transferencia no pueden superar el total. El excedente solo aplica en efectivo u «Otro» (cambio).",
            });
        }
        if (!settlement.balanced) {
            return res.status(400).json({
                ok: false,
                message: `Falta por cubrir ${settlement.remaining}. Recibido (efectivo/Otro): ${settlement.cashReceived}; adeudo: ${settlement.cashDue}.`,
            });
        }
        // Persistir monto aplicado a la venta (no el billete); recibido/cambio en reference.
        const exactPayments = normalizedPayments.filter((p) => !paymentAllowsChange(p.method));
        const changePayments = normalizedPayments.filter((p) => paymentAllowsChange(p.method));
        const efectivoReceived = (0, pos_service_1.roundMoney)(changePayments
            .filter((p) => p.method === "efectivo_sucursal")
            .reduce((s, p) => s + p.amount, 0));
        const otroReceived = (0, pos_service_1.roundMoney)(changePayments
            .filter((p) => p.method === "otro")
            .reduce((s, p) => s + p.amount, 0));
        const efectivoUserRefs = changePayments
            .filter((p) => p.method === "efectivo_sucursal")
            .map((p) => p.reference)
            .filter(Boolean)
            .join(" | ");
        const otroUserRefs = changePayments
            .filter((p) => p.method === "otro")
            .map((p) => p.reference)
            .filter(Boolean)
            .join(" | ");
        // Primero efectivo (afecta caja), luego Otro.
        let dueLeft = settlement.cashDue;
        const appliedEfectivo = (0, pos_service_1.roundMoney)(Math.min(efectivoReceived, dueLeft));
        dueLeft = (0, pos_service_1.roundMoney)(Math.max(0, dueLeft - appliedEfectivo));
        const appliedOtro = (0, pos_service_1.roundMoney)(Math.min(otroReceived, dueLeft));
        const finalPayments = [...exactPayments];
        if (appliedEfectivo > 0.009) {
            const cashRefParts = [
                efectivoReceived > appliedEfectivo + 0.009
                    ? `Recibido ${efectivoReceived.toFixed(2)}`
                    : null,
                settlement.changeDue > 0.009 && !(otroReceived > 0.009)
                    ? `Cambio ${settlement.changeDue.toFixed(2)}`
                    : efectivoReceived > appliedEfectivo + 0.009
                        ? `Cambio ${(0, pos_service_1.roundMoney)(efectivoReceived - appliedEfectivo).toFixed(2)}`
                        : null,
                efectivoUserRefs || null,
            ].filter(Boolean);
            finalPayments.push({
                method: "efectivo_sucursal",
                amount: appliedEfectivo,
                reference: cashRefParts.length
                    ? cashRefParts.join(" · ").slice(0, 255)
                    : null,
            });
        }
        if (appliedOtro > 0.009) {
            const otroRefParts = [
                otroUserRefs || null,
                otroReceived > appliedOtro + 0.009
                    ? `Recibido ${otroReceived.toFixed(2)}`
                    : null,
                settlement.changeDue > 0.009 &&
                    (otroReceived > appliedOtro + 0.009 || appliedEfectivo <= 0.009)
                    ? `Cambio ${otroReceived > appliedOtro + 0.009
                        ? (0, pos_service_1.roundMoney)(otroReceived - appliedOtro).toFixed(2)
                        : settlement.changeDue.toFixed(2)}`
                    : null,
            ].filter(Boolean);
            finalPayments.push({
                method: "otro",
                amount: appliedOtro,
                reference: otroRefParts.length
                    ? otroRefParts.join(" · ").slice(0, 255)
                    : null,
            });
        }
        const status = "completed";
        // Solo efectivo en caja física (Otro no mueve gaveta/sesión).
        const cashAmount = appliedEfectivo;
        // Encabezado / caja: siempre bodega física PCinBOX (ignorar branchId del body).
        let branch = await (0, pcinbox_pickup_constants_1.resolvePosCashBranchId)();
        if (!branch || !Number.isSafeInteger(branch) || branch <= 0) {
            const fromItems = normalizedItems.find((it) => it.branchId != null)?.branchId;
            branch = fromItems != null ? Number(fromItems) : NaN;
        }
        if (!Number.isSafeInteger(branch) || branch <= 0) {
            return res.status(400).json({
                ok: false,
                message: "No está configurada la bodega de cobro PCinBOX (sin branch providerId=1 ni leon2). Revisa branches en BD.",
            });
        }
        // Cotización vinculada: no exige que todo el carrito sea solo de la cotización.
        // Se permiten productos extra de catálogo y líneas manuales/servicios.
        // Los precios cotizados se validan por línea vía useQuotePrice + linesJson.
        let guestEmail = String(customerEmail || "").trim();
        let guestPhone = String(customerPhone || "").trim();
        let guestName = String(customerName || "").trim();
        let guestLastname = "";
        let customerUser = null;
        if (customerUserId != null && customerUserId !== "") {
            const cid = Number(customerUserId);
            if (!Number.isSafeInteger(cid) || cid <= 0) {
                return res.status(400).json({ ok: false, message: "Cliente inválido" });
            }
            const exists = await prismaClient_1.prisma.users.findFirst({
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
        // Nombre y teléfono son opcionales; si se capturan, validar formato.
        if (guestName && guestName.trim().length > 0 && guestName.trim().length < 2) {
            return res.status(400).json({
                ok: false,
                message: "Si capturas nombre, usa al menos 2 caracteres",
            });
        }
        const phoneDigits = String(guestPhone || "").replace(/\D/g, "");
        if (phoneDigits.length > 0 && phoneDigits.length < 10) {
            return res.status(400).json({
                ok: false,
                message: "Si capturas teléfono, debe tener al menos 10 dígitos",
            });
        }
        const sale = await prismaClient_1.prisma.$transaction(async (tx) => {
            const folio = await (0, pos_service_1.nextPosFolio)(tx);
            const displayName = [guestName, guestLastname].filter(Boolean).join(" ").trim() || null;
            const catalogShared = await (0, posSerial_service_1.loadSharedBarcodeKeys)(tx, normalizedItems.flatMap((it) => it.serials));
            const lineSerialIsShared = (serial, upc) => (0, posSerial_service_1.serialIsSharedBarcode)(serial, upc, catalogShared);
            const sharedSerials = normalizedItems.flatMap((it) => {
                const serials = it.serials.filter((serial) => lineSerialIsShared(serial, it.productUpc));
                if (serials.length === 0)
                    return [];
                return [
                    {
                        productId: it.productId,
                        productName: it.productName,
                        serials,
                        warrantyMonths: it.warrantyMonths ?? null,
                        warrantyMode: it.warrantyMode ?? null,
                    },
                ];
            });
            let cashSessionId = null;
            if (status === "completed" && cashAmount > 0) {
                const openCash = await (0, posCash_service_1.requireOpenCashSession)(branch, tx);
                cashSessionId = openCash.idCashSession;
            }
            const created = await tx.pos_sales.create({
                data: {
                    folio,
                    branchId: branch,
                    cashierUserId,
                    customerUserId: customerUser,
                    customerName: displayName,
                    customerEmail: guestEmail || null,
                    customerPhone: guestPhone || null,
                    status,
                    subtotal,
                    discountTotal,
                    total,
                    notes: notes ? String(notes).slice(0, 2000) : null,
                    requiredFactura,
                    cashSessionId,
                    quoteNumber,
                    idempotencyKey: idempotencyKey || null,
                    items: {
                        create: normalizedItems.map((it) => {
                            const unitCost = it.costSourceProductId != null
                                ? unitCostsByProductId.get(it.costSourceProductId)
                                : undefined;
                            return {
                                productId: it.productId,
                                branchId: it.branchId,
                                productName: it.productName,
                                productSku: it.productSku,
                                productUpc: it.productUpc,
                                quantity: it.quantity,
                                unitPrice: new client_1.Prisma.Decimal(it.unitPrice),
                                discountPct: new client_1.Prisma.Decimal(it.discountPct),
                                lineTotal: new client_1.Prisma.Decimal(it.lineTotal),
                                warrantyMonths: it.warrantyMonths,
                                warrantyMode: it.warrantyMode,
                                serviceMetaJson: it.serviceMetaJson
                                    ? it.serviceMetaJson
                                    : client_1.Prisma.JsonNull,
                                costUnit: unitCost
                                    ? new client_1.Prisma.Decimal(unitCost.costUnit)
                                    : null,
                                profitMarginUnit: unitCost
                                    ? new client_1.Prisma.Decimal(unitCost.profitMarginUnit)
                                    : null,
                                catalogPriceUnit: unitCost
                                    ? new client_1.Prisma.Decimal(unitCost.catalogPriceUnit)
                                    : null,
                            };
                        }),
                    },
                    payments: {
                        create: finalPayments.map((p) => ({
                            method: p.method,
                            amount: new client_1.Prisma.Decimal(p.amount),
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
                                    quoteNumber: quoteNumber || undefined,
                                    deliveryAddresses: deliveryAddresses || undefined,
                                    deliveryAddress: deliveryAddresses?.[0] || undefined,
                                    sourceFolio: sourceFolio || undefined,
                                    priceOverrides: priceOverrides.length > 0 ? priceOverrides : undefined,
                                    cashAmount: cashAmount > 0 ? cashAmount : undefined,
                                    cashReceived: settlement.cashReceived > 0
                                        ? settlement.cashReceived
                                        : undefined,
                                    changeDue: settlement.changeDue > 0.009
                                        ? settlement.changeDue
                                        : undefined,
                                    stockReservedOnCreate: true,
                                    sharedSerials: sharedSerials.length > 0 ? sharedSerials : undefined,
                                },
                            },
                        ],
                    },
                },
                include: saleInclude,
            });
            if (status === "completed" && cashAmount > 0) {
                await (0, posCash_service_1.recordSaleCashInTx)(tx, {
                    branchId: branch,
                    userId: cashierUserId,
                    posSaleId: created.idPosSale,
                    cashAmount,
                });
            }
            const allSerialsFlat = normalizedItems.flatMap((it) => it.serials.filter((serial) => !lineSerialIsShared(serial, it.productUpc)));
            if (allSerialsFlat.length > 0 && !sourceFolio) {
                await (0, posSerial_service_1.assertSerialsAvailable)(tx, allSerialsFlat);
            }
            if (status === "completed") {
                const usedItemIds = new Set();
                for (const norm of normalizedItems) {
                    const itemRow = created.items.find((i) => {
                        const id = Number(i.idPosSaleItem);
                        if (usedItemIds.has(id))
                            return false;
                        return (Number(i.productId) === norm.productId &&
                            String(i.productName || "") === norm.productName &&
                            Number(i.quantity) === norm.quantity);
                    });
                    if (!itemRow)
                        continue;
                    usedItemIds.add(Number(itemRow.idPosSaleItem));
                    let serialsToAssign = [...(norm.serials || [])].filter((s) => String(s || "").trim());
                    const hasWarranty = norm.warrantyMode === "none" ||
                        norm.warrantyMode === "service_center" ||
                        norm.warrantyMode === "months" ||
                        (norm.warrantyMonths != null && Number(norm.warrantyMonths) > 0);
                    if (serialsToAssign.length === 0 && hasWarranty && norm.isManual) {
                        const qty = Math.max(1, Number(norm.quantity) || 1);
                        serialsToAssign = Array.from({ length: qty }, (_, i) => `POS-W-${created.idPosSale}-${itemRow.idPosSaleItem}-${i + 1}`);
                    }
                    if (serialsToAssign.length === 0)
                        continue;
                    const trackableSerials = serialsToAssign.filter((serial) => !lineSerialIsShared(serial, norm.productUpc));
                    if (trackableSerials.length === 0)
                        continue;
                    await (0, posSerial_service_1.assignSerialsOnSale)(tx, {
                        productId: norm.productId,
                        branchId: norm.branchId ?? branch,
                        posSaleId: created.idPosSale,
                        posSaleItemId: itemRow.idPosSaleItem,
                        serials: trackableSerials,
                        customerUserId: customerUser,
                        customerName: displayName,
                        warrantyMonths: norm.warrantyMonths,
                        warrantyMode: norm.warrantyMode,
                        allowAlreadySold: Boolean(sourceFolio),
                        productUpc: norm.productUpc,
                    });
                }
            }
            // Reserva stock también en pending_payment (OpenPay); al confirmar no se vuelve a descontar.
            {
                const stockItems = normalizedItems
                    .filter((it) => !it.isManual &&
                    !it.skipStock &&
                    it.providerId === posStock_service_1.POS_STOCK_PROVIDER_ID)
                    .map((it) => ({
                    productId: it.productId,
                    quantity: it.quantity,
                    branchId: it.branchId,
                }));
                if (stockItems.length > 0) {
                    await (0, posStock_service_1.decrementPosStock)(tx, stockItems, cashierUserId, folio);
                    (0, pos_service_1.invalidatePosSearchCatalog)();
                }
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
        const fresh = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: sale.idPosSale },
            include: saleInclude,
        });
        return res.status(201).json({
            ok: true,
            message: "Venta POS completada",
            data: serializeSale(fresh),
        });
    }
    catch (error) {
        const rawIdem = req.body?.idempotencyKey ??
            req.headers["idempotency-key"] ??
            req.headers["Idempotency-Key"];
        const idemKey = String(Array.isArray(rawIdem) ? rawIdem[0] : rawIdem || "").trim();
        if (error?.code === "P2002" &&
            idemKey &&
            Number.isSafeInteger(Number(req.idUser)) &&
            Number(req.idUser) > 0) {
            try {
                const raced = await prismaClient_1.prisma.pos_sales.findFirst({
                    where: { idempotencyKey: idemKey },
                    include: saleInclude,
                });
                if (raced && Number(raced.cashierUserId) === Number(req.idUser)) {
                    return res.status(200).json({
                        ok: true,
                        message: "Venta ya registrada (reintento seguro)",
                        alreadyProcessed: true,
                        data: serializeSale(raced),
                    });
                }
            }
            catch {
                // caer al error genérico
            }
        }
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo completar la venta",
        });
    }
};
exports.createPosSale = createPosSale;
const listPosSales = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const branchId = req.query.branchId ? Number(req.query.branchId) : null;
        const status = req.query.status ? String(req.query.status) : null;
        const folio = req.query.folio ? String(req.query.folio).trim() : "";
        const customerName = req.query.customerName
            ? String(req.query.customerName).trim()
            : "";
        const saleIdRaw = String(req.query.saleId || req.query.idPosSale || "").trim();
        const from = req.query.from ? new Date(String(req.query.from)) : null;
        const to = req.query.to ? new Date(String(req.query.to)) : null;
        const hasSerials = String(req.query.hasSerials || "") === "1" ||
            String(req.query.hasSerials || "").toLowerCase() === "true";
        const where = {};
        if (branchId && Number.isSafeInteger(branchId))
            where.branchId = branchId;
        if (status && ["completed", "cancelled", "pending_payment"].includes(status)) {
            where.status = status;
        }
        const saleId = Number(saleIdRaw.replace(/^#/, ""));
        if (saleIdRaw && Number.isSafeInteger(saleId) && saleId > 0) {
            where.idPosSale = saleId;
        }
        if (folio) {
            // Búsqueda parcial (sin exigir folio exacto).
            const term = folio.replace(/^#/, "").trim();
            if (term) {
                where.folio = { contains: term };
            }
        }
        if (customerName) {
            // Prefijo aprovecha índice mejor que LIKE '%x%'.
            if (customerName.length >= 2) {
                where.customerName = { startsWith: customerName };
            }
        }
        if (from || to) {
            where.createdAt = {};
            if (from && !Number.isNaN(from.getTime()))
                where.createdAt.gte = from;
            if (to && !Number.isNaN(to.getTime()))
                where.createdAt.lte = to;
        }
        if (hasSerials) {
            where.serials = { some: {} };
        }
        const [total, rows] = await Promise.all([
            prismaClient_1.prisma.pos_sales.count({ where }),
            prismaClient_1.prisma.pos_sales.findMany({
                where,
                include: saleListInclude,
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar ventas POS",
        });
    }
};
exports.listPosSales = listPosSales;
const getPosSaleById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: saleInclude,
        });
        if (!sale) {
            return res.status(404).json({ ok: false, message: "Venta no encontrada" });
        }
        return res.json({ ok: true, data: serializeSale(sale) });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al obtener la venta",
        });
    }
};
exports.getPosSaleById = getPosSaleById;
const cancelPosSale = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const id = Number(req.params.id);
        const reason = String(req.body?.reason || "").trim();
        const password = String(req.body?.password || "");
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        if (reason.length < 3) {
            return res.status(400).json({
                ok: false,
                message: "Indica un motivo de cancelación (mín. 3 caracteres)",
            });
        }
        if (!password) {
            return res.status(400).json({
                ok: false,
                message: "Confirma la cancelación con tu contraseña de administrador",
            });
        }
        const adminUser = await prismaClient_1.prisma.users.findFirst({
            where: { idUser: userId, active: 1 },
            select: { idUser: true, role: true, password: true },
        });
        if (!adminUser?.password) {
            return res.status(401).json({
                ok: false,
                message: "No se pudo validar tu sesión. Vuelve a iniciar sesión.",
            });
        }
        if (adminUser.role !== "admin") {
            return res.status(403).json({
                ok: false,
                message: "Solo un administrador puede cancelar ventas del POS",
            });
        }
        const passwordOk = await (0, index_service_1.verifyPassword)(password, adminUser.password);
        if (!passwordOk) {
            // 403 (no 401): la sesión JWT sigue válida; solo falló la re-auth de cancelación.
            // Un 401 en el admin dispara "sesión expirada" y cierra este modal.
            return res.status(403).json({
                ok: false,
                message: "Contraseña incorrecta",
            });
        }
        const posRole = await resolvePosRole(req);
        const updated = await prismaClient_1.prisma.$transaction(async (tx) => {
            const sale = await tx.pos_sales.findFirst({
                where: { idPosSale: id },
                include: { items: true, payments: true },
            });
            if (!sale)
                throw new Error("Venta no encontrada");
            if (sale.status === "cancelled") {
                throw new Error("Esta venta ya está cancelada");
            }
            assertPosCancelAllowed(posRole, {
                status: sale.status,
                createdAt: sale.createdAt,
            });
            const previousStatus = sale.status;
            const claimed = await tx.pos_sales.updateMany({
                where: {
                    idPosSale: id,
                    status: { in: ["completed", "pending_payment"] },
                },
                data: {
                    status: "cancelled",
                    cancelReason: reason.slice(0, 2000),
                    cancelledAt: new Date(),
                    cancelledByUserId: userId,
                },
            });
            if (claimed.count === 0) {
                throw new Error("No se pudo cancelar (estado ya cambió). Reintenta.");
            }
            // Solo se devuelve el stock que esta venta sí descontó.
            // Un folio importado no genera movimiento, así que cancelarlo no repone existencia.
            if (previousStatus === "completed" || previousStatus === "pending_payment") {
                const taken = await tx.inventory_movements.findMany({
                    where: {
                        refType: "pos_sale",
                        refId: sale.folio,
                        reason: "pos_sale",
                        delta: { lt: 0 },
                    },
                    select: { productId: true, branchId: true, delta: true },
                });
                const stockLines = taken.map((movement) => ({
                    productId: Number(movement.productId),
                    quantity: Math.abs(Number(movement.delta)),
                    branchId: movement.branchId != null ? Number(movement.branchId) : null,
                }));
                if (stockLines.length > 0) {
                    await (0, posStock_service_1.restorePosStock)(tx, stockLines, userId, sale.folio);
                    (0, pos_service_1.invalidatePosSearchCatalog)();
                }
                if (previousStatus === "completed") {
                    const cashAmount = (0, pos_service_1.roundMoney)(sale.payments
                        .filter((p) => p.method === "efectivo_sucursal")
                        .reduce((s, p) => s + Number(p.amount), 0));
                    if (cashAmount > 0) {
                        await (0, posCash_service_1.recordSaleCashVoidInTx)(tx, {
                            branchId: Number(sale.branchId),
                            userId,
                            posSaleId: sale.idPosSale,
                            cashSessionId: sale.cashSessionId,
                            cashAmount,
                            folio: sale.folio,
                        });
                    }
                }
            }
            await (0, posSerial_service_1.releaseSerialsOnCancel)(tx, sale.idPosSale);
            await tx.pos_sale_events.create({
                data: {
                    posSaleId: sale.idPosSale,
                    userId,
                    eventType: "cancelled",
                    reason: reason.slice(0, 2000),
                    payload: {
                        previousStatus,
                        cancelledByRole: posRole,
                    },
                },
            });
            return tx.pos_sales.findFirst({
                where: { idPosSale: id },
                include: saleInclude,
            });
        });
        return res.json({
            ok: true,
            message: "Venta cancelada. El inventario fue restaurado si aplica.",
            data: serializeSale(updated),
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo cancelar la venta",
        });
    }
};
exports.cancelPosSale = cancelPosSale;
const getPosSaleTicket = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: saleInclude,
        });
        if (!sale) {
            return res.status(404).json({ ok: false, message: "Venta no encontrada" });
        }
        const data = serializeSale(sale);
        const html = (0, posTicketHtml_service_1.buildPosSaleTicketHtml)(data);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(html);
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al generar ticket",
        });
    }
};
exports.getPosSaleTicket = getPosSaleTicket;
/** Hoja de garantía printable (estilo Dicotech). */
const getPosSaleWarrantySheet = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const sale = await prismaClient_1.prisma.pos_sales.findFirst({
            where: { idPosSale: id },
            include: saleInclude,
        });
        if (!sale) {
            return res.status(404).json({ ok: false, message: "Venta no encontrada" });
        }
        if (sale.status !== "completed") {
            return res.status(400).json({
                ok: false,
                message: "La hoja de garantía solo aplica a ventas completadas con series entregadas.",
            });
        }
        const data = serializeSale(sale);
        const hasSoldSerials = (data.items || []).some((it) => Array.isArray(it.serials) && it.serials.length > 0);
        if (!hasSoldSerials) {
            return res.status(400).json({
                ok: false,
                message: "Esta venta no tiene números de serie para garantía.",
            });
        }
        const formatMoney = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
        const formatFolioDisplay = (folio) => {
            const raw = String(folio || "")
                .trim()
                .replace(/^PV-/i, "");
            return /^\d+$/.test(raw) ? String(Number(raw)) : raw;
        };
        const branchLabel = (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(data.branchName) ||
            (0, pcinbox_branch_display_1.formatPcinboxBranchDisplayName)(data.items.find((it) => it.branchName)
                ?.branchName) ||
            "PCinBOX-León";
        const warrantyDate = new Date(data.createdAt).toLocaleString("es-MX", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
        // Misma Clave que la tabla de Garantías del POS: #{idPosSale}
        const warrantyNumber = `#${data.idPosSale}`;
        const LOGO = "https://ik.imagekit.io/pcinboxkit/logos/logo.png?updatedAt=1759534318587";
        const ADDRESS = "Blvd. Juan Alonso de Torres Pte. No. 1917 Local 1 Col. Unión Comunitaria de León C.P. 37239 León, Gto., México";
        const meaningfulCode = (value) => {
            const v = String(value || "").trim();
            if (!v)
                return null;
            if (v === "__POS_MANUAL__")
                return null;
            if (v === "__POS_SERVICE__")
                return null;
            if (/^manual$/i.test(v))
                return null;
            return v;
        };
        const rows = [];
        for (const it of data.items) {
            const serials = it.serials && it.serials.length
                ? it.serials
                : [
                    {
                        serialNumber: "—",
                        warrantyMonths: null,
                        warrantyMode: null,
                        warrantyExpiresAt: null,
                    },
                ];
            for (const s of serials) {
                const tiempo = (0, posWarranty_service_1.warrantyCoverageLabel)(s.warrantyMode, s.warrantyMonths);
                const upc = meaningfulCode(it.productUpc) || "—";
                const clave = meaningfulCode(it.productSku) || "—";
                const serialRaw = String(s.serialNumber || "").trim();
                const serialDisplay = !serialRaw || /^POS-W-\d+-\d+-\d+$/i.test(serialRaw)
                    ? "—"
                    : serialRaw;
                rows.push(`
      <tr>
        <td>${escapeHtml(upc)}</td>
        <td>${escapeHtml(clave)}</td>
        <td>${escapeHtml(it.productName)}</td>
        <td style="text-align:right">${formatMoney(it.unitPrice)}</td>
        <td style="text-align:center">${escapeHtml(tiempo)}</td>
        <td class="serie">${escapeHtml(serialDisplay)}</td>
      </tr>`);
            }
        }
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hoja de Garantía ${escapeHtml(formatFolioDisplay(data.folio))}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f3f4f6; padding: 24px; }
    .sheet { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 28px 24px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; }
    .brand { flex: 0 0 auto; }
    .brand img { display: block; height: 56px; width: auto; max-width: 180px; object-fit: contain; }
    h1 { font-size: 20px; text-align: center; flex: 1; text-transform: uppercase; letter-spacing: 0.04em; }
    .addr { font-size: 11px; color: #6b7280; line-height: 1.4; margin-bottom: 14px; text-align: center; }
    .meta { font-size: 13px; line-height: 1.7; margin-bottom: 16px; }
    .meta strong { display: inline-block; min-width: 140px; }
    h2 { font-size: 14px; margin: 16px 0 8px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 8px 6px; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
    th { background: #f9fafb; text-align: left; }
    td.serie { font-size: 11px; word-break: break-all; }
    .terms { margin-top: 18px; font-size: 11px; line-height: 1.45; color: #374151; }
    .terms ol { padding-left: 18px; }
    .terms li { margin: 6px 0; }
    .actions { margin-top: 18px; display: flex; gap: 8px; justify-content: center; }
    button { border: 0; background: #bb3d4b; color: #fff; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .sheet { border: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="brand">
        <img src="${LOGO}" alt="PCinBOX" />
      </div>
      <h1>Hoja de Garantía</h1>
      <div style="width:180px"></div>
    </div>
    <p class="addr">${escapeHtml(ADDRESS)} · ${escapeHtml(branchLabel)}</p>
    <div class="meta">
      <div><strong>Número de garantía:</strong> ${escapeHtml(warrantyNumber)}</div>
      <div><strong>Folio venta:</strong> ${escapeHtml(formatFolioDisplay(data.folio))}</div>
      <div><strong>Fecha de compra:</strong> ${escapeHtml(warrantyDate)}</div>
      <div><strong>Vendedor:</strong> PCinBOX</div>
      <div><strong>Cliente:</strong> ${escapeHtml(data.customerName || "")}</div>
    </div>
    <h2>Detalle de garantía</h2>
    <table>
      <thead>
        <tr>
          <th>UPC</th>
          <th>Clave</th>
          <th>Descripción</th>
          <th>Costo</th>
          <th>Tiempo / cobertura</th>
          <th>Serie</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <div class="terms">
      <p style="margin-bottom:10px;font-size:11px;color:#6b7280">
        Si la columna «Tiempo / cobertura» indica «Según marca / centro de servicio»,
        el trámite se realiza con el fabricante o su red autorizada conforme a sus políticas.
        No se captura un plazo fijo en mostrador salvo que el producto lo tenga definido en catálogo.
      </p>
      <ol>
        <li>Para marcas con centro de servicio autorizado (Acer, Samsung, HP, Lenovo, Dell, etc.), la garantía se tramita directamente con el fabricante.</li>
        <li>Si el producto se presenta a garantía y funciona correctamente, podrá aplicarse un cargo de revisión.</li>
        <li>La compatibilidad del producto es responsabilidad del cliente; no procede devolución por incompatibilidad.</li>
        <li>En dispositivos de almacenamiento la garantía cubre el equipo, no recuperación de datos ni instalación de software.</li>
        <li>No procede garantía con daño físico (rayones, golpes, quemaduras, pines doblados, etc.).</li>
        <li>El producto debe entregarse completo (accesorios, manuales y empaque cuando aplique).</li>
        <li>El valor de reposición puede considerar depreciación y condiciones de mercado.</li>
        <li>En monitores/pantallas, la garantía por pixeles muertos aplica conforme a política de marca (referencia: 5 o más).</li>
        <li>El cambio inmediato por falla de fábrica aplica solo dentro de los primeros 2 meses, sujeto a revisión y políticas vigentes.</li>
        <li>No hay cambios ni devoluciones por arrepentimiento de compra.</li>
        <li>Las licencias e instalaciones de software no cuentan con garantía de este documento.</li>
      </ol>
    </div>
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </div>
</body>
</html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(html);
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al generar hoja de garantía",
        });
    }
};
exports.getPosSaleWarrantySheet = getPosSaleWarrantySheet;
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
// --- Caja (Fase 2) ---
const getPosCashStatus = async (req, res) => {
    try {
        const branchId = Number(req.query.branchId);
        const data = await (0, posCash_service_1.getCashStatus)(branchId);
        return res.json({ ok: true, data });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "Error al consultar caja",
        });
    }
};
exports.getPosCashStatus = getPosCashStatus;
const openPosCash = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const branchId = Number(req.body?.branchId);
        const openingFloat = Number(req.body?.openingFloat);
        const notes = req.body?.notes ? String(req.body.notes) : null;
        const data = await (0, posCash_service_1.openCashSession)({
            branchId,
            userId,
            openingFloat,
            notes,
        });
        const alreadyOpen = Boolean(data.alreadyOpen);
        return res.status(alreadyOpen ? 200 : 201).json({
            ok: true,
            message: alreadyOpen
                ? "La caja ya estaba abierta en esta bodega"
                : "Caja abierta",
            data,
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo abrir caja",
        });
    }
};
exports.openPosCash = openPosCash;
const addPosCashMovement = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const branchId = Number(req.body?.branchId);
        const type = String(req.body?.type || "");
        const amount = Number(req.body?.amount);
        const reason = req.body?.reason ? String(req.body.reason) : null;
        const data = await (0, posCash_service_1.addManualCashMovement)({
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
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo registrar el movimiento",
        });
    }
};
exports.addPosCashMovement = addPosCashMovement;
const closePosCash = async (req, res) => {
    try {
        const userId = Number(req.idUser);
        const branchId = Number(req.body?.branchId);
        const closingCounted = Number(req.body?.closingCounted);
        const notes = req.body?.notes ? String(req.body.notes) : null;
        const differenceReason = req.body?.differenceReason
            ? String(req.body.differenceReason)
            : null;
        const data = await (0, posCash_service_1.closeCashSession)({
            branchId,
            userId,
            closingCounted,
            notes,
            differenceReason,
        });
        const diff = Number(data.difference || 0);
        const hasDiff = Math.abs(diff) > 0.009;
        return res.json({
            ok: true,
            message: hasDiff
                ? `Corte cerrado con descuadre de ${diff.toFixed(2)}`
                : "Corte de caja cerrado (cuadrado)",
            data,
        });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo cerrar caja",
        });
    }
};
exports.closePosCash = closePosCash;
const listPosCashSessions = async (req, res) => {
    try {
        const branchId = req.query.branchId ? Number(req.query.branchId) : null;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
        const result = await (0, posCash_service_1.listCashSessions)({ branchId, page, limit });
        return res.json({ ok: true, ...result });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar sesiones de caja",
        });
    }
};
exports.listPosCashSessions = listPosCashSessions;
const getPosCashSessionById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const data = await (0, posCash_service_1.getCashSessionById)(id);
        if (!data) {
            return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
        }
        return res.json({ ok: true, data });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al obtener sesión",
        });
    }
};
exports.getPosCashSessionById = getPosCashSessionById;
const listPosCashSessionMovements = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
        const result = await (0, posCash_service_1.listCashSessionMovements)({
            sessionId: id,
            page,
            limit,
        });
        if (!result) {
            return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
        }
        return res.json({ ok: true, ...result });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar movimientos de caja",
        });
    }
};
exports.listPosCashSessionMovements = listPosCashSessionMovements;
/** Ledger unificado web + POS (Fase 4). */
const listInventoryMovements = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
        const productId = req.query.productId ? Number(req.query.productId) : null;
        const branchId = req.query.branchId ? Number(req.query.branchId) : null;
        const reason = req.query.reason ? String(req.query.reason) : null;
        const from = req.query.from ? new Date(String(req.query.from)) : null;
        const to = req.query.to ? new Date(String(req.query.to)) : null;
        const where = {};
        if (productId && Number.isSafeInteger(productId))
            where.productId = productId;
        if (branchId && Number.isSafeInteger(branchId))
            where.branchId = branchId;
        if (reason)
            where.reason = reason;
        // Sin filtros de producto/bodega: acotar a últimos 30 días para no escanear el ledger entero.
        if (from || to) {
            where.createdAt = {};
            if (from && !Number.isNaN(from.getTime()))
                where.createdAt.gte = from;
            if (to && !Number.isNaN(to.getTime()))
                where.createdAt.lte = to;
        }
        else if (!productId && !branchId) {
            const since = new Date();
            since.setDate(since.getDate() - 30);
            where.createdAt = { gte: since };
        }
        const [total, rows] = await Promise.all([
            prismaClient_1.prisma.inventory_movements.count({ where }),
            prismaClient_1.prisma.inventory_movements.findMany({
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
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al listar movimientos",
        });
    }
};
exports.listInventoryMovements = listInventoryMovements;
// --- Series / garantías (Fase 3) ---
const searchPosSerials = async (req, res) => {
    try {
        const q = String(req.query.q || "");
        const data = await (0, posSerial_service_1.searchSerials)(q);
        return res.json({ ok: true, data });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "Error al buscar series",
        });
    }
};
exports.searchPosSerials = searchPosSerials;
const getPosSerial = async (req, res) => {
    try {
        const serial = String(req.params.serial || "");
        const data = await (0, posSerial_service_1.getSerialByNumber)(serial);
        if (!data) {
            return res.status(404).json({ ok: false, message: "Serie no encontrada" });
        }
        return res.json({ ok: true, data });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error?.message || "Error al obtener serie",
        });
    }
};
exports.getPosSerial = getPosSerial;
const markPosSerialRma = async (req, res) => {
    try {
        const serialNumber = String(req.body?.serialNumber || req.params.serial || "");
        const notes = req.body?.notes ? String(req.body.notes) : null;
        const data = await (0, posSerial_service_1.markSerialRma)({ serialNumber, notes });
        return res.json({ ok: true, message: "Serie marcada como RMA", data });
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo marcar RMA",
        });
    }
};
exports.markPosSerialRma = markPosSerialRma;
const registerPosSerial = async (req, res) => {
    try {
        const productId = Number(req.body?.productId);
        const serialNumber = String(req.body?.serialNumber || "");
        const branchId = req.body?.branchId != null ? Number(req.body.branchId) : null;
        const notes = req.body?.notes ? String(req.body.notes) : null;
        const data = await (0, posSerial_service_1.registerAvailableSerial)({
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
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo registrar la serie",
        });
    }
};
exports.registerPosSerial = registerPosSerial;
const updatePosProductSerialConfig = async (req, res) => {
    try {
        const posRole = await resolvePosRole(req);
        if (posRole !== "admin") {
            return res.status(403).json({
                ok: false,
                message: "Solo un administrador puede cambiar si el producto exige serie",
            });
        }
        const productId = Number(req.params.productId);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return res.status(400).json({
                ok: false,
                message: "No se pudo cambiar si el producto exige serie porque no tiene un identificador válido. Si la línea viene de un folio importado, pulsa «Quitar folio» e impórtalo de nuevo. Si se repite, reporta a soporte el folio y el nombre del producto.",
            });
        }
        const hasCols = await (0, posSerialFlags_service_1.productsHaveSerialColumns)();
        if (!hasCols) {
            return res.status(400).json({
                ok: false,
                message: "Faltan columnas requiresSerial/warrantyMonths en products. Aplica la migración 20260908_pos_serial_columns.",
            });
        }
        const requiresSerial = req.body?.requiresSerial != null
            ? Boolean(req.body.requiresSerial)
            : undefined;
        const warrantyMonths = req.body?.warrantyMonths != null
            ? Number(req.body.warrantyMonths)
            : undefined;
        const data = {};
        if (requiresSerial !== undefined)
            data.requiresSerial = requiresSerial;
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
        const updated = await prismaClient_1.prisma.products.update({
            where: { idProduct: productId },
            data,
            select: {
                idProduct: true,
                name: true,
                requiresSerial: true,
                warrantyMonths: true,
            },
        });
        (0, pos_service_1.invalidatePosSearchCatalog)();
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
    }
    catch (error) {
        return res.status(400).json({
            ok: false,
            message: error?.message || "No se pudo actualizar el producto",
        });
    }
};
exports.updatePosProductSerialConfig = updatePosProductSerialConfig;
//# sourceMappingURL=pos.controller.js.map