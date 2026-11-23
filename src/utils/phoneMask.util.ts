/**
 * Enmascara teléfono almacenado como "+52 4771234567".
 * Nunca devolver el número completo al cliente en APIs de lectura.
 */

export const PHONE_REMINDER_MS = 24 * 60 * 60 * 1000;

export function maskUserPhone(phone: string | null | undefined): string | null {
  const raw = typeof phone === "string" ? phone.trim() : "";
  if (!raw) return null;
  if (raw.includes("*")) return raw;

  // "+52 4771234567"
  const spaced = raw.match(/^(\+\d{1,3})\s+(\d{10})$/);
  if (spaced) {
    return `${spaced[1]} ******${spaced[2]!.slice(-4)}`;
  }

  // "+524771234567" (formato frecuente en domicilios)
  const glued = raw.match(/^(\+\d{1,3})(\d{10})$/);
  if (glued) {
    return `${glued[1]} ******${glued[2]!.slice(-4)}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) {
    const prefix = raw.match(/^\+\d{1,3}/)?.[0];
    return `${prefix ? `${prefix} ` : ""}******${digits.slice(-4)}`;
  }

  return "****";
}

/** true si el cliente mandó máscara / vacío / incompleto (no sobrescribir en update). */
export function isMaskedOrIncompletePhone(
  phone: string | null | undefined,
): boolean {
  const raw = typeof phone === "string" ? phone.trim() : "";
  if (!raw) return true;
  if (raw.includes("*")) return true;
  if (/^\+\d{1,3}\s+\d{10}$/.test(raw)) return false;
  if (/^\+\d{1,3}\d{10}$/.test(raw)) return false;
  return true;
}

export function normalizeStoredPhone(
  phone: string | null | undefined,
): string {
  const raw = typeof phone === "string" ? phone.trim().replace(/\s+/g, " ") : "";
  const spaced = raw.match(/^(\+\d{1,3})\s+(\d{10})$/);
  if (spaced) return `${spaced[1]} ${spaced[2]}`;
  const glued = raw.match(/^(\+\d{1,3})(\d{10})$/);
  if (glued) return `${glued[1]} ${glued[2]}`;
  return raw;
}

export function hasUserPhone(phone: string | null | undefined): boolean {
  return Boolean(typeof phone === "string" && phone.trim());
}

export function buildPhoneReminderState(input: {
  isGoogleAccount: boolean;
  hasPhone: boolean;
  dismissedAt: Date | null | undefined;
  nowMs?: number;
}): {
  reminderDue: boolean;
  reminderAvailableAt: string | null;
} {
  const now = input.nowMs ?? Date.now();

  if (!input.isGoogleAccount || input.hasPhone) {
    return { reminderDue: false, reminderAvailableAt: null };
  }

  if (!input.dismissedAt) {
    return { reminderDue: true, reminderAvailableAt: null };
  }

  const availableAtMs = input.dismissedAt.getTime() + PHONE_REMINDER_MS;
  if (now >= availableAtMs) {
    return { reminderDue: true, reminderAvailableAt: null };
  }

  return {
    reminderDue: false,
    reminderAvailableAt: new Date(availableAtMs).toISOString(),
  };
}
