/**
 * Días no hábiles para plazos de cancelación en México (zona America/Mexico_City).
 * Descanso obligatorio federal: LFT Art. 74.
 * Mantener alineado con `pcinbox-core/src/mexico-business-days.ts`.
 */
export declare const MEXICO_TZ = "America/Mexico_City";
export type MexicoCalendarDay = {
    year: number;
    month: number;
    day: number;
    /** 0 = domingo … 6 = sábado (igual que Date#getDay) */
    weekday: number;
};
export declare function getMexicoCalendarDay(date: Date): MexicoCalendarDay;
export declare function isMexicanMandatoryRestHoliday(date: Date): boolean;
export declare function isMexicanNonBusinessDay(date: Date): boolean;
/**
 * paidAt + windowMs; si el vencimiento cae en no hábil (MX),
 * se suma 24h calendario hasta caer en día hábil (conserva la hora).
 */
export declare function getBusinessAwareDeadline(start: Date, windowMs: number): Date;
//# sourceMappingURL=mexicoBusinessDays.d.ts.map