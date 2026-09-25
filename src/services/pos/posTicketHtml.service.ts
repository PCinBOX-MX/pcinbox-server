import {
  POS_TICKET_BRANCH_FALLBACK,
  resolveTicketBranchLabel,
} from "../../constants/pcinbox-branch-display";


const SELLER = "pcinbox";
const LOGO =
  "https://ik.imagekit.io/pcinboxkit/logos/logo.png?updatedAt=1759534318587";
const WEB = "www.pcinbox.com.mx";
const ADDRESS =
  "Blvd. Juan Alonso de Torres Pte. No. 1917 Local 1 Col. Unión Comunitaria de León C.P. 37239 León, Gto., México";
const DISCLAIMER_PARAGRAPHS = [
  "pcinbox no se hace responsable si usted eligió mal el producto o por incompatibilidad con su equipo.",
  "Es responsabilidad del cliente revisar lo que se entrega y hacer reclamo u observación en su momento.",
  "No hay devolución ni cambios de productos. Cualquier devolución justificada genera el 20% de comisión.",
] as const;
const TERMS_LINE =
  "Al dejar su equipo, el cliente acepta nuestros Términos y Condiciones de Servicio Técnico. Consúltelos en pcinbox.com.mx/servicio-tecnico";

function isMeaningfulCode(value?: string | null): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  if (v === "__POS_MANUAL__") return false;
  if (v === "__POS_SERVICE__") return false;
  if (/^manual$/i.test(v)) return false;
  return true;
}

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
    serials?: Array<{ serialNumber: string }>;
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

function formatMoney(n: number) {
  return Number(n || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "MXN",
  });
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const METHOD_LABEL: Record<string, string> = {
  efectivo_sucursal: "Efectivo",
  tarjeta_sucursal: "Tarjeta",
  tarjeta_credito_sucursal: "Tarjeta de Crédito",
  tarjeta_debito_sucursal: "Tarjeta de Débito",
  transferencia_bancaria: "Transferencia",
  openpay_link: "OpenPay",
  otro: "Otro",
};

function parsePagoCambio(sale: TicketSale) {
  let nonCash = 0;
  let cashReceived = 0;
  let hasCashReceived = false;
  let cambio = 0;
  for (const p of sale.payments) {
    if (p.method === "efectivo_sucursal" || p.method === "otro") {
      const ref = String(p.reference || "");
      const rec = ref.match(/Recibido\s+([\d.]+)/i);
      const cam = ref.match(/Cambio\s+([\d.]+)/i);
      if (cam) cambio = Math.max(cambio, Number(cam[1]) || 0);
      if (rec) {
        cashReceived += Number(rec[1]) || 0;
        hasCashReceived = true;
      } else {
        cashReceived += Number(p.amount) || 0;
      }
    } else {
      nonCash += Number(p.amount) || 0;
    }
  }
  const sum = nonCash + cashReceived;
  const pago =
    hasCashReceived || sum > 0 ? sum : Number(sale.total) || 0;
  return { pago, cambio };
}

function truncateTicketName(name: string, max = 220): string {
  const s = String(name || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}

function formatTicketFolio(folio: string | null | undefined): string {
  const raw = String(folio || "")
    .trim()
    .replace(/^PV-/i, "");
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw;
}

export function buildPosSaleTicketHtml(data: TicketSale): string {
  const { pago, cambio } = parsePagoCambio(data);
  const productCount = data.items.reduce(
    (s, it) => s + Number(it.quantity || 0),
    0,
  );

  const itemsHtml = data.items
    .map((it) => {
      const qty = Number(it.quantity) || 0;
      const unit = Number(it.unitPrice) || 0;
      const lineTotal = Number(it.lineTotal) || 0;
      const qtyLine =
        qty > 1
          ? `<div>Cant: ${qty} x ${formatMoney(unit)}</div>`
          : `<div>Cantidad: ${qty || 1}</div>`;
      const intake = it.serviceIntake;
      const isServiceLine = Boolean(
        intake &&
          ((Array.isArray(intake.equipment) && intake.equipment.length > 0) ||
            String(intake.serviceType || "").trim() ||
            String(intake.failureOrRequestedService || "").trim()),
      );
      const bodega = isServiceLine
        ? POS_TICKET_BRANCH_FALLBACK
        : resolveTicketBranchLabel({
            itemBranchName:
              it.branchName ||
              String(it.branchLabel || "")
                .split(/[·—-]/)[0]
                ?.trim() ||
              null,
            saleBranchName: data.branchName,
          });
      // Si el formateo dejó "PCinBOX" genérico, forzar León.
      const bodegaShown =
        !bodega || /^pcinbox$/i.test(bodega.trim())
          ? POS_TICKET_BRANCH_FALLBACK
          : bodega;
      const bodegaLine = `<div>Bodega: ${escapeHtml(bodegaShown)}</div>`;
      const serialLine =
        it.serials && it.serials.length
          ? `<div class="muted">S/N: ${it.serials
              .map((s) => escapeHtml(s.serialNumber))
              .join(", ")}</div>`
          : "";
      let serviceBlock = "";
      if (intake && Array.isArray(intake.equipment) && intake.equipment.length) {
        const equipLines = intake.equipment
          .map((eq) => {
            const qty = Number(eq.quantity) || 1;
            const desc = escapeHtml(String(eq.description || "").trim() || "—");
            const sn = String(eq.serialNumber || "").trim();
            return `
            <div class="equip-item">
              <div class="equip-item-title">${desc}${qty > 1 ? ` (×${qty})` : ""}</div>
              ${sn ? `<div class="muted">Nº serie: ${escapeHtml(sn)}</div>` : ""}
            </div>`;
          })
          .join("");
        const failure = String(intake.failureOrRequestedService || "").trim();
        const obs = String(
          intake.technicalObservationsOnReceipt || "",
        ).trim();
        serviceBlock = `
        <div class="service-intake">
          <div class="service-title">Datos del Equipo y/o componente</div>
          ${equipLines}
          ${
            failure
              ? `<div class="equip-note"><strong>Falla o Servicio solicitado:</strong> ${escapeHtml(failure)}</div>`
              : ""
          }
          ${
            obs
              ? `<div class="equip-note"><strong>Observaciones Técnicas al Recibir:</strong> ${escapeHtml(obs)}</div>`
              : ""
          }
        </div>`;
      }
      const serviceLabel = String(
        intake?.serviceType || it.productName || "",
      ).trim();
      const nameHtml = isServiceLine
        ? `Servicio: ${escapeHtml(truncateTicketName(serviceLabel || it.productName))}`
        : escapeHtml(truncateTicketName(it.productName));
      return `
      <div class="item">
        <div class="item-name">${nameHtml}</div>
        ${isMeaningfulCode(it.productSku) ? `<div>Clave: ${escapeHtml(String(it.productSku))}</div>` : ""}
        ${isMeaningfulCode(it.productUpc) ? `<div>UPC: ${escapeHtml(String(it.productUpc))}</div>` : ""}
        ${bodegaLine}
        ${qtyLine}
        <div class="item-prices">
          <span>Importe:</span>
          <span>${formatMoney(lineTotal)}</span>
        </div>
        ${serialLine}
        ${serviceBlock}
      </div>`;
    })
    .join("");

  const paymentsHtml = data.payments
    .map((p) => {
      const ref = String(p.reference || "").trim();
      const rec = ref.match(/Recibido\s+([\d.]+)/i);
      const cam = ref.match(/Cambio\s+([\d.]+)/i);
      let label: string;
      if (p.method === "otro") {
        const detail = ref
          .replace(/\s*·\s*Recibido\s+[\d.]+/gi, "")
          .replace(/\s*·\s*Cambio\s+[\d.]+/gi, "")
          .replace(/\s*Recibido\s+[\d.]+/gi, "")
          .replace(/\s*Cambio\s+[\d.]+/gi, "")
          .replace(/^\s*·\s*|\s*·\s*$/g, "")
          .trim();
        label = detail ? `Otro: ${escapeHtml(detail)}` : "Otro";
      } else {
        label = METHOD_LABEL[p.method] || p.method;
      }
      const amount = rec ? Number(rec[1]) || 0 : Number(p.amount) || 0;
      const sub = cam
        ? `<br/><small>Cambio ${formatMoney(Number(cam[1]) || 0)}</small>`
        : !rec && ref && !/Recibido|Cambio/i.test(ref)
          ? `<br/><small>${escapeHtml(ref)}</small>`
          : "";
      return `<div class="pay-line"><span>${label}${sub}</span><strong>${formatMoney(amount)}</strong></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ticket ${escapeHtml(formatTicketFolio(data.folio))}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #111; background: #f3f4f6; padding: 24px; }
    .ticket { max-width: 360px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 16px; }
    .brand { text-align: center; margin-bottom: 10px; }
    .brand img { width: 72px; height: 72px; object-fit: contain; display: block; margin: 0 auto 6px; }
    .brand h1 { font-size: 22px; letter-spacing: -0.02em; color: #bb3d4b; }
    .brand .title { font-size: 13px; font-weight: 700; margin-top: 4px; }
    .brand .branch { font-size: 12px; margin-top: 2px; }
    .muted { color: #6b7280; font-size: 11px; }
    .meta { font-size: 12px; margin: 12px 0; line-height: 1.55; }
    .sep { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin: 12px 0 8px; color: #374151; }
    .item { font-size: 12px; line-height: 1.45; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e5e7eb; }
    .item-name { font-weight: 700; margin-bottom: 2px; word-break: break-word; overflow-wrap: anywhere; }
    .item-prices { display: flex; justify-content: space-between; margin-top: 4px; font-weight: 600; gap: 8px; }
    .service-intake { margin-top: 8px; padding: 8px; background: #f9fafb; border-radius: 8px; font-size: 11px; line-height: 1.45; }
    .service-title { font-weight: 700; margin-bottom: 8px; color: #374151; }
    .equip-item { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #e5e7eb; }
    .equip-item:last-of-type { margin-bottom: 6px; }
    .equip-item-title { font-weight: 700; margin-bottom: 2px; color: #111; }
    .equip-note { margin-top: 6px; }
    .totals { margin-top: 8px; font-size: 13px; }
    .totals .row { display: flex; justify-content: space-between; margin: 4px 0; }
    .count { text-align: center; font-size: 16px; font-weight: 800; margin: 14px 0 8px; }
    .notes { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #e5e7eb; font-size: 12px; line-height: 1.45; }
    .notes h4 { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 4px; color: #374151; }
    .notes p { white-space: pre-wrap; word-break: break-word; }
    .disclaimer { margin-top: 14px; padding-top: 12px; border-top: 1px solid #d1d5db; }
    .disclaimer h4 { text-align: center; font-size: 11px; letter-spacing: 0.06em; margin-bottom: 8px; color: #111; }
    .disclaimer p { font-size: 10px; color: #4b5563; line-height: 1.45; text-align: justify; margin-bottom: 8px; }
    .disclaimer p:last-of-type { margin-bottom: 0; }
    .disclaimer .web { text-align: center; font-size: 11px; margin-top: 10px; color: #6b7280; }
    .pay-line { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; gap: 8px; }
    .actions { margin-top: 18px; display: flex; gap: 8px; justify-content: center; }
    button { border: 0; background: #bb3d4b; color: #fff; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: inherit; }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .ticket { border: 0; box-shadow: none; max-width: 100%; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      <img
        src="${LOGO}"
        alt=""
        onerror="this.style.display='none';var ok=document.getElementById('brand-ok');var fb=document.getElementById('brand-fb');if(ok)ok.style.display='none';if(fb)fb.style.display='block'"
      />
      <h1 id="brand-ok">pcinbox</h1>
      <h1 id="brand-fb" style="display:none">pcinbox</h1>
      <div class="title">TICKET DE VENTA</div>
      <div class="muted" style="margin-top:6px;line-height:1.35">${escapeHtml(ADDRESS)}</div>
      <div class="muted">${escapeHtml(WEB)}</div>
    </div>
    <div class="meta">
      <div>Folio: ${escapeHtml(formatTicketFolio(data.folio))}</div>
      ${
        data.status && data.status !== "completed"
          ? `<div style="color:#b45309;font-weight:700">Estado: ${escapeHtml(
              data.status === "cancelled"
                ? "CANCELADA"
                : data.status === "pending_payment"
                  ? "PENDIENTE DE PAGO"
                  : String(data.status).toUpperCase(),
            )}</div>`
          : ""
      }
      ${
        data.quoteNumber
          ? `<div>No. Cotización: ${escapeHtml(String(data.quoteNumber))}</div>`
          : ""
      }
      <div>Fecha: ${new Date(data.createdAt).toLocaleString("es-MX")}</div>
      <div>Vendedor: ${escapeHtml(SELLER)}</div>
      <div>Cliente: ${escapeHtml(data.customerName || "Público general")}</div>
      ${
        String(data.customerPhone || "").trim()
          ? `<div>Teléfono: ${escapeHtml(String(data.customerPhone).trim())}</div>`
          : ""
      }
    </div>
    <div class="sep">*** PRODUCTOS ***</div>
    ${itemsHtml}
    <div class="totals">
      <div class="row"><span>Total:</span><span>${formatMoney(data.total)}</span></div>
      <div class="row"><span>Pago:</span><span>${formatMoney(pago)}</span></div>
      <div class="row"><span>Cambio:</span><span>${formatMoney(cambio)}</span></div>
    </div>
    <div class="count">Productos: ${Number(productCount || 0).toLocaleString("en-US")}</div>
    ${
      data.payments.length
        ? `<div style="margin-top:14px"><strong style="font-size:12px">Detalle de pago</strong>${paymentsHtml}</div>`
        : ""
    }
    ${
      String(data.notes || "").trim()
        ? `<div class="notes"><h4>Nota</h4><p>${escapeHtml(String(data.notes).trim())}</p></div>`
        : ""
    }
    <div class="disclaimer">
      <h4>Aviso</h4>
      ${DISCLAIMER_PARAGRAPHS.map(
        (p) => `<p>${escapeHtml(p)}</p>`,
      ).join("")}
      <p>${escapeHtml(TERMS_LINE)}</p>
      <div class="web">${escapeHtml(WEB)}</div>
    </div>
    ${
      data.cancelReason
        ? `<p class="muted" style="margin-top:12px;text-align:left">Cancelación: ${escapeHtml(data.cancelReason)}</p>`
        : ""
    }
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </div>
</body>
</html>`;
}
