/**
 * Enmascara teléfono almacenado como "+52 4771234567".
 * Nunca devolver el número completo al cliente en APIs de lectura.
 */

export const PHONE_REMINDER_MS = 24 * 60 * 60 * 1000;

export function maskUserPhone(phone: string | null | undefined): string | null {
  const raw = typeof phone === "string" ? phone.trim() : "";
  if (!raw) return null;

  const match = raw.match(/^(\+\d{1,3})\s+(\d{10})$/);
  if (!match) {
    if (raw.length <= 4) return "****";
    return `${"*".repeat(raw.length - 4)}${raw.slice(-4)}`;
  }

  const countryCode = match[1] ?? "+52";
  const number = match[2] ?? "";
  if (number.length < 4) return `${countryCode} ****`;
  return `${countryCode} ${"*".repeat(6)}${number.slice(-4)}`;
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
