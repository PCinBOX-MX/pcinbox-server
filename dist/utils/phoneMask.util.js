"use strict";
/**
 * Enmascara teléfono almacenado como "+52 4771234567".
 * Nunca devolver el número completo al cliente en APIs de lectura.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHONE_REMINDER_MS = void 0;
exports.maskUserPhone = maskUserPhone;
exports.hasUserPhone = hasUserPhone;
exports.buildPhoneReminderState = buildPhoneReminderState;
exports.PHONE_REMINDER_MS = 24 * 60 * 60 * 1000;
function maskUserPhone(phone) {
    const raw = typeof phone === "string" ? phone.trim() : "";
    if (!raw)
        return null;
    const match = raw.match(/^(\+\d{1,3})\s+(\d{10})$/);
    if (!match) {
        if (raw.length <= 4)
            return "****";
        return `${"*".repeat(raw.length - 4)}${raw.slice(-4)}`;
    }
    const countryCode = match[1] ?? "+52";
    const number = match[2] ?? "";
    if (number.length < 4)
        return `${countryCode} ****`;
    return `${countryCode} ${"*".repeat(6)}${number.slice(-4)}`;
}
function hasUserPhone(phone) {
    return Boolean(typeof phone === "string" && phone.trim());
}
function buildPhoneReminderState(input) {
    const now = input.nowMs ?? Date.now();
    if (!input.isGoogleAccount || input.hasPhone) {
        return { reminderDue: false, reminderAvailableAt: null };
    }
    if (!input.dismissedAt) {
        return { reminderDue: true, reminderAvailableAt: null };
    }
    const availableAtMs = input.dismissedAt.getTime() + exports.PHONE_REMINDER_MS;
    if (now >= availableAtMs) {
        return { reminderDue: true, reminderAvailableAt: null };
    }
    return {
        reminderDue: false,
        reminderAvailableAt: new Date(availableAtMs).toISOString(),
    };
}
//# sourceMappingURL=phoneMask.util.js.map