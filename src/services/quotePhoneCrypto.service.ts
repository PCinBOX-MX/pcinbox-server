import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * Clave 32 bytes:
 * - COTIZACIONES_PHONE_ENCRYPTION_KEY (hex 64 o base64 32 bytes), o
 * - derivada de KEY_JWT (misma en todos los nodos que lean cotizaciones).
 */
const resolveKey = (): Buffer => {
  const configured = process.env.COTIZACIONES_PHONE_ENCRYPTION_KEY?.trim();
  if (configured) {
    if (/^[0-9a-fA-F]{64}$/.test(configured)) {
      return Buffer.from(configured, "hex");
    }
    const fromB64 = Buffer.from(configured, "base64");
    if (fromB64.length === 32) return fromB64;
    throw new Error(
      "COTIZACIONES_PHONE_ENCRYPTION_KEY inválida (usa hex 64 o base64 de 32 bytes)",
    );
  }

  const jwt = process.env.KEY_JWT?.trim();
  if (!jwt) {
    throw new Error(
      "Falta KEY_JWT o COTIZACIONES_PHONE_ENCRYPTION_KEY para cifrar teléfonos de cotización",
    );
  }
  return createHash("sha256")
    .update(`pcinbox-quote-phone-v1:${jwt}`)
    .digest();
};

/** Cifra teléfono capturado. Formato: v1.<iv>.<tag>.<cipher> (base64url). */
export const encryptCapturedPhone = (plain: string): string => {
  const value = String(plain || "").trim();
  if (!value) {
    throw new Error("Teléfono vacío");
  }

  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
};

/**
 * Descifra para admin. Acepta plaintext legacy (`+52 …`) si aún no estaba cifrado.
 */
export const decryptCapturedPhone = (
  stored: string | null | undefined,
): string | null => {
  const raw = String(stored || "").trim();
  if (!raw) return null;

  if (!raw.startsWith(`${VERSION}.`)) {
    // Valores previos a cifrado (si los hubo en local).
    if (/^\+\d{1,3}\s+\d{7,15}$/.test(raw)) return raw;
    return null;
  }

  const parts = raw.split(".");
  if (parts.length !== 4) return null;

  const [, ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) return null;

  try {
    const key = resolveKey();
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8");
    return plain.trim() || null;
  } catch {
    return null;
  }
};
