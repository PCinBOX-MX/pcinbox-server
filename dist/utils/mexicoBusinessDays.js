"use strict";
/**
 * Días no hábiles para plazos de cancelación en México (zona America/Mexico_City).
 * Descanso obligatorio federal: LFT Art. 74.
 * Mantener alineado con `pcinbox-core/src/mexico-business-days.ts`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEXICO_TZ = void 0;
exports.getMexicoCalendarDay = getMexicoCalendarDay;
exports.isMexicanMandatoryRestHoliday = isMexicanMandatoryRestHoliday;
exports.isMexicanNonBusinessDay = isMexicanNonBusinessDay;
exports.getBusinessAwareDeadline = getBusinessAwareDeadline;
exports.MEXICO_TZ = "America/Mexico_City";
function pad2(n) {
    return String(n).padStart(2, "0");
}
function getMexicoCalendarDay(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: exports.MEXICO_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
    }).formatToParts(date);
    const map = {};
    for (const part of parts) {
        if (part.type !== "literal")
            map[part.type] = part.value;
    }
    const weekdayMap = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    const weekdayKey = map.weekday ?? "";
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        weekday: weekdayMap[weekdayKey] ?? 0,
    };
}
function nthWeekdayOfMonth(year, month, weekday, n) {
    // Encuentra el n-ésimo weekday (0=domingo) del mes usando UTC noon como ancla.
    const first = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
    const firstWeekday = first.getUTCDay();
    const offset = (weekday - firstWeekday + 7) % 7;
    return 1 + offset + (n - 1) * 7;
}
/** Transmisión del Poder Ejecutivo (LFT): Dic 1 hasta 2018; desde 2024, Oct 1. */
function isPresidentialTransitionHoliday(year, month, day) {
    if (year >= 2024) {
        return month === 10 && day === 1 && (year - 2024) % 6 === 0;
    }
    return month === 12 && day === 1 && (year - 2018) % 6 === 0;
}
function isMexicanMandatoryRestHoliday(date) {
    const { year, month, day, weekday } = getMexicoCalendarDay(date);
    // Fijos
    if (month === 1 && day === 1)
        return true; // Año Nuevo
    if (month === 5 && day === 1)
        return true; // Día del Trabajo
    if (month === 9 && day === 16)
        return true; // Independencia
    if (month === 12 && day === 25)
        return true; // Navidad
    if (isPresidentialTransitionHoliday(year, month, day))
        return true;
    // Lunes festivos
    if (weekday === 1) {
        if (month === 2 && day === nthWeekdayOfMonth(year, 2, 1, 1))
            return true; // Constitución
        if (month === 3 && day === nthWeekdayOfMonth(year, 3, 1, 3))
            return true; // Benito Juárez
        if (month === 11 && day === nthWeekdayOfMonth(year, 11, 1, 3))
            return true; // Revolución
    }
    return false;
}
function isMexicanNonBusinessDay(date) {
    const { weekday } = getMexicoCalendarDay(date);
    if (weekday === 0 || weekday === 6)
        return true;
    return isMexicanMandatoryRestHoliday(date);
}
/**
 * paidAt + windowMs; si el vencimiento cae en no hábil (MX),
 * se suma 24h calendario hasta caer en día hábil (conserva la hora).
 */
function getBusinessAwareDeadline(start, windowMs) {
    let deadline = new Date(start.getTime() + windowMs);
    let guard = 0;
    while (isMexicanNonBusinessDay(deadline) && guard < 21) {
        deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
        guard += 1;
    }
    return deadline;
}
//# sourceMappingURL=mexicoBusinessDays.js.map