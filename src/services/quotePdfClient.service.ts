import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";
import { resolveQuotePath } from "./quoteStorage.service";

const META_PREFIX = "pcinbox-client-v1";
const LINES_META_PREFIX = "pcinbox-lines-v1";
const MANUAL_META_PREFIX = "pcinbox-manual-v1";
const ASSEMBLY_META_PREFIX = "pcinbox-assembly-v1";
const SHIPPING_META_PREFIX = "pcinbox-shipping-v1";

export type QuotePdfClientIdentity = {
  name: string | null;
  email: string | null;
  phone: string | null;
  /** true cuando el bloque Cliente es "Venta público general" o está vacío */
  isPublicSale: boolean;
};

export type QuotePdfLinePrice = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type QuotePdfManualLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  name: string;
  upc: string | null;
};

export type QuotePdfShipping = {
  shippingCost: number;
  label: string;
};

export type QuotePdfSaleExtras = {
  manualById: Map<string, QuotePdfManualLine>;
  assemblyPrice: number | null;
  shipping: QuotePdfShipping[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
/** Ej: +52 5512345678 | +1 5551234567 */
const PHONE_RE = /^\+\d{1,3}\s+\d{7,15}$/;
const CLIENT_START = /^cliente$/i;
const CLIENT_END =
  /^(no\.?\s*cotizaci[oó]n|vigencia|venta\s+p[uú]blico\s+general)$/i;
const PUBLIC_SALE_RE = /^venta\s+p[uú]blico\s+general$/i;

const emptyIdentity = (): QuotePdfClientIdentity => ({
  name: null,
  email: null,
  phone: null,
  isPublicSale: true,
});

const decodePdfLiteral = (raw: string): string => {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === "n") {
      out += "\n";
      i += 1;
      continue;
    }
    if (next === "r") {
      out += "\r";
      i += 1;
      continue;
    }
    if (next === "t") {
      out += "\t";
      i += 1;
      continue;
    }
    if (next === "b" || next === "f") {
      i += 1;
      continue;
    }
    if (next === "(" || next === ")" || next === "\\") {
      out += next;
      i += 1;
      continue;
    }
    if (/[0-7]/.test(next)) {
      let oct = next;
      i += 1;
      for (let k = 0; k < 2; k += 1) {
        const dig = raw[i + 1];
        if (dig === undefined || !/[0-7]/.test(dig)) break;
        i += 1;
        oct += dig;
      }
      out += String.fromCharCode(parseInt(oct, 8));
      continue;
    }
    out += next;
    i += 1;
  }
  return out;
};

const EMAIL_VALUE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_VALUE_RE = /^\+\d{1,3}\s+\d{7,15}$/;
/** Corta basura de objetos PDF pegada al valor (")endobj…", "<<", etc.). */
const PDF_JUNK_CUT_RE = /\)?\s*(?:endobj|obj<<|<<|\/Type|\/Font|\/Producer)/i;

const sanitizeKeywordValue = (raw: string): string => {
  let value = String(raw || "").trim();
  const junk = value.search(PDF_JUNK_CUT_RE);
  if (junk >= 0) value = value.slice(0, junk);
  // Paréntesis de cierre del literal PDF
  value = value.replace(/\)+$/g, "").trim();
  return value;
};

const sanitizeName = (raw: string | null): string | null => {
  if (!raw) return null;
  const value = sanitizeKeywordValue(raw)
    .replace(/[^\p{L}\p{N}\s.'\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.slice(0, 120) || null;
};

const sanitizeEmail = (raw: string | null): string | null => {
  if (!raw) return null;
  const value = sanitizeKeywordValue(raw).slice(0, 255);
  return EMAIL_VALUE_RE.test(value) ? value : null;
};

const sanitizePhone = (raw: string | null): string | null => {
  if (!raw) return null;
  const value = sanitizeKeywordValue(raw);
  if (PHONE_VALUE_RE.test(value)) return value;
  // Intentar rescatar "+52 ##########" al inicio si vino basura pegada
  const m = value.match(/^(\+\d{1,3}\s+\d{7,15})/);
  return m?.[1] || null;
};

/** Parsea el string Keywords embebido (con o sin prefijo visible). */
export const parseClientKeywordsString = (
  keywords: string | null | undefined,
): QuotePdfClientIdentity | null => {
  if (!keywords || !keywords.includes(META_PREFIX)) return null;

  // Solo el segmento de metadatos; evita arrastrar "endobj…" del PDF
  const metaMatch = keywords.match(
    /pcinbox-client-v1(?:\|(?:name|email|phone)=[^|\n\r]+|\|public=1)*/i,
  );
  const scoped = metaMatch?.[0] || keywords;
  const parts = scoped.split("|").map((p) => p.trim());
  if (!parts.some((p) => p === META_PREFIX || p.toLowerCase() === META_PREFIX)) {
    return null;
  }

  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let isPublic = false;

  for (const part of parts) {
    if (part === "public=1") isPublic = true;
    else if (part.startsWith("name=")) name = sanitizeName(part.slice(5));
    else if (part.startsWith("email=")) email = sanitizeEmail(part.slice(6));
    else if (part.startsWith("phone=")) phone = sanitizePhone(part.slice(6));
  }

  if (isPublic || (!name && !email && !phone)) {
    return emptyIdentity();
  }

  return { name, email, phone, isPublicSale: false };
};

const utf16BeToString = (bytes: Buffer): string => {
  const swapped = Buffer.alloc(bytes.length);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1]!;
    swapped[i + 1] = bytes[i]!;
  }
  return swapped.toString("utf16le");
};

const decodePdfHexString = (hex: string): string => {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, "");
  if (cleaned.length < 2 || cleaned.length % 2 !== 0) return "";
  const bytes = Buffer.from(cleaned, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return utf16BeToString(bytes.subarray(2));
  }
  if (bytes.length % 2 === 0) {
    return utf16BeToString(bytes);
  }
  return bytes.toString("latin1");
};

/** Lee el string crudo de /Keywords del PDF (literal, hex u objeto indirecto). */
export const extractPdfKeywordsString = (
  pdfBytes: Buffer,
): string | null => {
  const source = pdfBytes.toString("latin1");

  const decodeLiteralOrHex = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      return decodePdfLiteral(trimmed.slice(1, -1));
    }
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      return decodePdfHexString(trimmed.slice(1, -1));
    }
    return null;
  };

  const literal = source.match(/\/Keywords\s*\((?:\\.|[^\\)])*\)/);
  if (literal) {
    const inner = literal[0].replace(/^\/Keywords\s*\(/, "").replace(/\)$/, "");
    const decoded = decodePdfLiteral(inner);
    if (decoded.trim()) return decoded;
  }

  const hex = source.match(/\/Keywords\s*<([0-9A-Fa-f\s]+)>/);
  if (hex?.[1]) {
    const decoded = decodePdfHexString(hex[1]);
    if (decoded.trim()) return decoded;
  }

  const ref = source.match(/\/Keywords\s+(\d+)\s+(\d+)\s+R/);
  if (ref?.[1]) {
    const objNum = ref[1];
    const gen = ref[2] || "0";
    const objRe = new RegExp(
      `${objNum}\\s+${gen}\\s+obj\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]+>)\\s*endobj`,
      "m",
    );
    const objMatch = source.match(objRe);
    if (objMatch?.[1]) {
      const decoded = decodeLiteralOrHex(objMatch[1]);
      if (decoded?.trim()) return decoded;
    }
  }

  // Fallback: prefijo ASCII en el binario
  const clientIdx = source.indexOf(META_PREFIX);
  const linesIdx = source.indexOf(LINES_META_PREFIX);
  const idx =
    clientIdx >= 0 && linesIdx >= 0
      ? Math.min(clientIdx, linesIdx)
      : clientIdx >= 0
        ? clientIdx
        : linesIdx;
  if (idx >= 0) {
    const slice = source.slice(idx, idx + 8000);
    const cutAt = slice.search(/\)|\bendobj\b|obj<<|<<|\x00/);
    const candidate = (cutAt >= 0 ? slice.slice(0, cutAt) : slice).trim();
    if (candidate) return candidate;
  }

  return null;
};

/**
 * Precios unitarios embebidos: pcinbox-lines-v1|id:qty:price;id:qty:price
 * (números sin $ ni comas).
 */
export const parseLinesKeywordsString = (
  keywords: string | null | undefined,
): QuotePdfLinePrice[] | null => {
  if (!keywords || !keywords.includes(LINES_META_PREFIX)) return null;

  const match = keywords.match(
    /pcinbox-lines-v1\|([0-9:;.\s]+?)(?=\|pcinbox-|$|\)|\bendobj\b|obj<<|<<)/i,
  );
  const payload = (match?.[1] || "").trim();
  if (!payload) return null;

  const lines: QuotePdfLinePrice[] = [];
  for (const rawPart of payload.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [productIdRaw, qtyRaw, priceRaw] = part.split(":");
    const productId = String(productIdRaw || "").trim();
    const quantity = Math.round(Number(qtyRaw));
    const unitPrice = Number(priceRaw);
    if (
      !productId ||
      productId.length > 64 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      continue;
    }
    lines.push({
      productId,
      quantity,
      unitPrice: Math.round((unitPrice + Number.EPSILON) * 100) / 100,
    });
  }

  return lines.length > 0 ? lines : null;
};

const decodeKeywordText = (token: string): string | null => {
  const cleaned = token.trim();
  if (!cleaned) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) return null;
  try {
    const text = Buffer.from(cleaned, "base64url").toString("utf8").trim();
    if (text.includes("\u0000")) return null;
    return text;
  } catch {
    return null;
  }
};

/**
 * Productos sin catálogo: pcinbox-manual-v1|id:qty:price:nombreB64:upcB64
 * El nombre y el UPC van en base64url para no romper el separador.
 */
export const parseManualKeywordsString = (
  keywords: string | null | undefined,
): QuotePdfManualLine[] => {
  if (!keywords || !keywords.includes(MANUAL_META_PREFIX)) return [];
  const match = keywords.match(
    /pcinbox-manual-v1\|([A-Za-z0-9:;.\-_]+?)(?=\|pcinbox-|$|\)|\bendobj\b|obj<<|<<)/i,
  );
  const payload = (match?.[1] || "").trim();
  if (!payload) return [];

  const lines: QuotePdfManualLine[] = [];
  for (const rawPart of payload.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [productIdRaw, qtyRaw, priceRaw, nameRaw, upcRaw] = part.split(":");
    const productId = String(productIdRaw || "").trim();
    const quantity = Math.round(Number(qtyRaw));
    const unitPrice = Number(priceRaw);
    const name = decodeKeywordText(String(nameRaw || ""));
    const upc = decodeKeywordText(String(upcRaw || ""));
    if (
      !productId ||
      productId.length > 64 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > 999999.99 ||
      name == null ||
      name.length < 2 ||
      name.length > 180 ||
      upc == null ||
      upc.length > 32
    ) {
      continue;
    }
    lines.push({
      productId,
      quantity,
      unitPrice: Math.round((unitPrice + Number.EPSILON) * 100) / 100,
      name,
      upc: upc || null,
    });
  }
  return lines;
};

/** Precio de ensamble de un equipo: pcinbox-assembly-v1|50.00 */
export const parseAssemblyKeywordString = (
  keywords: string | null | undefined,
): number | null => {
  if (!keywords || !keywords.includes(ASSEMBLY_META_PREFIX)) return null;
  const match = keywords.match(
    /pcinbox-assembly-v1\|(\d+(?:\.\d{1,2})?)(?=\|pcinbox-|$|\)|\bendobj\b|obj<<|<<)/i,
  );
  const amount = Number(match?.[1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

/** Envíos: pcinbox-shipping-v1|costo:etiquetaB64;costo:etiquetaB64 */
export const parseShippingKeywordString = (
  keywords: string | null | undefined,
): QuotePdfShipping[] => {
  if (!keywords || !keywords.includes(SHIPPING_META_PREFIX)) return [];
  const match = keywords.match(
    /pcinbox-shipping-v1\|([0-9A-Za-z:;.\-_]+?)(?=\|pcinbox-|$|\)|\bendobj\b|obj<<|<<)/i,
  );
  const payload = (match?.[1] || "").trim();
  if (!payload) return [];
  const rows: QuotePdfShipping[] = [];
  for (const rawPart of payload.split(";")) {
    const part = rawPart.trim();
    const sep = part.indexOf(":");
    if (sep < 1) continue;
    const shippingCost = Number(part.slice(0, sep));
    const label = decodeKeywordText(part.slice(sep + 1));
    if (
      !Number.isFinite(shippingCost) ||
      shippingCost < 0 ||
      shippingCost > 999999.99 ||
      label == null ||
      label.length < 2 ||
      label.length > 80
    ) {
      continue;
    }
    rows.push({
      shippingCost: Math.round((shippingCost + Number.EPSILON) * 100) / 100,
      label,
    });
  }
  return rows;
};

/** Lee Keywords del Info dict del PDF (metadatos embebidos al generar). */
export const parseClientFromPdfKeywords = (
  pdfBytes: Buffer,
): QuotePdfClientIdentity | null => {
  const keywords = extractPdfKeywordsString(pdfBytes);
  if (!keywords) return null;
  return parseClientKeywordsString(keywords);
};

export const parseLinesFromPdfKeywords = (
  pdfBytes: Buffer,
): QuotePdfLinePrice[] | null => {
  const keywords = extractPdfKeywordsString(pdfBytes);
  if (!keywords) return null;
  return parseLinesKeywordsString(keywords);
};

/** productId → unitPrice desde Keywords del PDF de cotización. */
export const readQuotePdfLinePrices = async (
  storageKey: string,
): Promise<Map<number, number>> => {
  const map = new Map<number, number>();
  try {
    const pdfPath = resolveQuotePath(storageKey);
    const bytes = await readFile(pdfPath);
    let lines = parseLinesFromPdfKeywords(bytes);
    if (!lines?.length) {
      const infoKeywords = await extractInfoKeywordsWithPdfParse(bytes);
      lines = parseLinesKeywordsString(infoKeywords);
    }
    for (const line of lines || []) {
      const pid = Number(line.productId);
      if (!Number.isSafeInteger(pid) || pid <= 0) continue;
      if (!map.has(pid)) map.set(pid, line.unitPrice);
    }
  } catch {
    /* PDF ausente o ilegible */
  }
  return map;
};

const readQuoteKeywords = async (
  storageKey: string,
): Promise<string | null> => {
  const pdfPath = resolveQuotePath(storageKey);
  const bytes = await readFile(pdfPath);
  return (
    extractPdfKeywordsString(bytes) ||
    (await extractInfoKeywordsWithPdfParse(bytes))
  );
};

/** Precios de productos sin catálogo y de ensamble, leídos del PDF. */
export const readQuotePdfSaleExtras = async (
  storageKey: string,
): Promise<QuotePdfSaleExtras> => {
  const manualById = new Map<string, QuotePdfManualLine>();
  try {
    const keywords = await readQuoteKeywords(storageKey);
    for (const line of parseManualKeywordsString(keywords)) {
      if (!manualById.has(line.productId)) manualById.set(line.productId, line);
    }
    return {
      manualById,
      assemblyPrice: parseAssemblyKeywordString(keywords),
      shipping: parseShippingKeywordString(keywords),
    };
  } catch {
    return { manualById, assemblyPrice: null, shipping: [] };
  }
};

export const parseQuotePdfClientFromText = (
  textOrTokens: string | string[],
): QuotePdfClientIdentity => {
  const flat = (Array.isArray(textOrTokens) ? textOrTokens : [textOrTokens])
    .flatMap((t) => String(t).split(/\r?\n+/))
    .map((t) => t.trim())
    .filter(Boolean);

  let start = -1;
  for (let i = 0; i < flat.length; i += 1) {
    const token = flat[i];
    if (token !== undefined && CLIENT_START.test(token)) {
      start = i + 1;
      break;
    }
  }

  if (start < 0) {
    return emptyIdentity();
  }

  const lines: string[] = [];
  for (let i = start; i < flat.length; i += 1) {
    const line = flat[i];
    if (line === undefined) continue;
    if (PUBLIC_SALE_RE.test(line)) {
      return emptyIdentity();
    }
    if (CLIENT_END.test(line)) break;
    if (
      /^(imagen|cant\.?|producto|descripci[oó]n|precio|importe|p\.\s*unitario|subtotal)$/i.test(
        line,
      )
    ) {
      break;
    }
    lines.push(line);
    if (lines.length >= 6) break;
  }

  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  for (const line of lines) {
    if (!email && EMAIL_RE.test(line)) {
      email = line;
      continue;
    }
    if (!phone && PHONE_RE.test(line)) {
      phone = line;
      continue;
    }
    if (!phone && /^\+\d{8,18}$/.test(line)) {
      const digits = line.slice(1);
      const known = ["52", "1", "34", "54", "57", "56", "51", "58"];
      let split: { lada: string; rest: string } | null = null;
      for (const code of known) {
        if (digits.startsWith(code) && digits.length - code.length >= 7) {
          split = { lada: `+${code}`, rest: digits.slice(code.length) };
          break;
        }
      }
      phone = split ? `${split.lada} ${split.rest}` : line;
      continue;
    }
    if (
      !name &&
      !EMAIL_RE.test(line) &&
      !PHONE_RE.test(line) &&
      !/^\+\d/.test(line)
    ) {
      name = line;
    }
  }

  return {
    name,
    email,
    phone,
    isPublicSale: !name && !email && !phone,
  };
};

const extractInfoKeywordsWithPdfParse = async (
  pdfBytes: Buffer,
): Promise<string | null> => {
  const parser = new PDFParse({ data: pdfBytes });
  try {
    const info = await parser.getInfo();
    const keywords =
      (info as { keywords?: unknown; Keywords?: unknown })?.keywords ??
      (info as { Keywords?: unknown })?.Keywords ??
      (info as { info?: { Keywords?: unknown; keywords?: unknown } })?.info
        ?.Keywords ??
      (info as { info?: { keywords?: unknown } })?.info?.keywords;
    return typeof keywords === "string" && keywords.trim() ? keywords : null;
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

const extractTextWithPdfParse = async (
  pdfBytes: Buffer,
): Promise<string | null> => {
  const parser = new PDFParse({ data: pdfBytes });
  try {
    const result = await parser.getText();
    const text =
      typeof result === "string"
        ? result
        : typeof (result as { text?: unknown })?.text === "string"
          ? (result as { text: string }).text
          : null;
    return text && text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

/**
 * Lee solo Keywords del PDF (rápido; sin pdf-parse).
 * Devuelve null si el PDF no trae metadatos pcinbox-client-v1.
 */
export const readQuotePdfClientIdentityLight = async (
  storageKey: string,
): Promise<QuotePdfClientIdentity | null> => {
  try {
    const pdfPath = resolveQuotePath(storageKey);
    const bytes = await readFile(pdfPath);
    return parseClientFromPdfKeywords(bytes);
  } catch {
    return null;
  }
};

/**
 * Lee el PDF de una cotización y obtiene el bloque Cliente.
 * Prioridad: Keywords (binario / pdf-parse info) → texto (pdf-parse) → vacío.
 */
export const readQuotePdfClientIdentity = async (
  storageKey: string,
): Promise<QuotePdfClientIdentity> => {
  try {
    const pdfPath = resolveQuotePath(storageKey);
    const bytes = await readFile(pdfPath);

    const fromKeywordsRaw = parseClientFromPdfKeywords(bytes);
    if (fromKeywordsRaw) return fromKeywordsRaw;

    const infoKeywords = await extractInfoKeywordsWithPdfParse(bytes);
    const fromInfo = parseClientKeywordsString(infoKeywords);
    if (fromInfo) return fromInfo;

    const text = await extractTextWithPdfParse(bytes);
    if (text) return parseQuotePdfClientFromText(text);

    return emptyIdentity();
  } catch {
    return emptyIdentity();
  }
};

/**
 * Resuelve customer a partir del PDF (sin mezclar con users de la cuenta).
 *
 * - Solo nombre → solo nombre (phone/email null).
 * - Solo teléfono → solo teléfono.
 * - Ambos → ambos (email solo si viene en el PDF).
 * - Público / vacío → nulls (el caller decide caer a la cuenta).
 *
 * `accountPhone` se ignora (firmas legacy); no rellenar huecos con users.phone.
 */
export const resolvePosCustomerFromPdf = (
  pdfClient: QuotePdfClientIdentity,
  _accountPhone?: string | null,
): {
  name: string | null;
  email: string | null;
  phone: string | null;
} => {
  if (pdfClient.isPublicSale) {
    return { name: null, email: null, phone: null };
  }

  return {
    name: pdfClient.name,
    email: pdfClient.email,
    phone: pdfClient.phone,
  };
};
