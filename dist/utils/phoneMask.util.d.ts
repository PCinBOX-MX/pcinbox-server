/**
 * Enmascara teléfono almacenado como "+52 4771234567".
 * Nunca devolver el número completo al cliente en APIs de lectura.
 */
export declare const PHONE_REMINDER_MS: number;
export declare function maskUserPhone(phone: string | null | undefined): string | null;
export declare function hasUserPhone(phone: string | null | undefined): boolean;
export declare function buildPhoneReminderState(input: {
    isGoogleAccount: boolean;
    hasPhone: boolean;
    dismissedAt: Date | null | undefined;
    nowMs?: number;
}): {
    reminderDue: boolean;
    reminderAvailableAt: string | null;
};
//# sourceMappingURL=phoneMask.util.d.ts.map