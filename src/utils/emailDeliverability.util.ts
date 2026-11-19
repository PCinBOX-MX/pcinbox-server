import dns from "node:dns/promises";
import disposableDomains from "disposable-email-domains";
import wildcardDomains from "disposable-email-domains/wildcard";

const DISPOSABLE_SET = new Set(
  disposableDomains.map((d) => String(d).toLowerCase()),
);

const WILDCARD_SET = new Set(
  wildcardDomains.map((d) => String(d).toLowerCase()),
);

export const DISPOSABLE_EMAIL_MESSAGE =
  "No aceptamos correos temporales. Usa un correo permanente (Gmail, Outlook, etc.).";

export const UNDELIVERABLE_EMAIL_MESSAGE =
  "Este correo no parece existir o no puede recibir mensajes. Usa otro correo.";

export function extractEmailDomain(email: string): string | null {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  const domain = normalized.slice(at + 1).replace(/\.+$/, "");
  return domain || null;
}

/** Dominios temporales/disposable (lista + wildcards del paquete). */
export function isDisposableEmail(email: string): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;

  if (DISPOSABLE_SET.has(domain)) return true;

  if (WILDCARD_SET.has(domain)) return true;

  for (const wildcard of WILDCARD_SET) {
    if (domain.endsWith(`.${wildcard}`)) return true;
  }

  return false;
}

async function domainHasDnsRecords(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
  } catch {
    // sin MX: probar A/AAAA (fallback RFC)
  }

  try {
    const a = await dns.resolve4(domain);
    if (a.length > 0) return true;
  } catch {
    // continue
  }

  try {
    const aaaa = await dns.resolve6(domain);
    if (aaaa.length > 0) return true;
  } catch {
    // continue
  }

  return false;
}

export type EmailDeliverabilityResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Valida que el correo no sea temporal y que el dominio pueda recibir correo.
 * No verifica existencia real del buzón (SMTP probing).
 */
export async function assertEmailDeliverable(
  email: string,
): Promise<EmailDeliverabilityResult> {
  if (isDisposableEmail(email)) {
    return { ok: false, message: DISPOSABLE_EMAIL_MESSAGE };
  }

  const domain = extractEmailDomain(email);
  if (!domain) {
    return { ok: false, message: UNDELIVERABLE_EMAIL_MESSAGE };
  }

  const canReceive = await domainHasDnsRecords(domain);
  if (!canReceive) {
    return { ok: false, message: UNDELIVERABLE_EMAIL_MESSAGE };
  }

  return { ok: true };
}
