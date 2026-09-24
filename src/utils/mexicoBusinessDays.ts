/**
 * Días no hábiles para plazos de cancelación en México (zona America/Mexico_City).
 * Descanso obligatorio federal: LFT Art. 74.
 * Mantener alineado con `pcinbox-core/src/mexico-business-days.ts`.
 */

export const MEXICO_TZ = "America/Mexico_City";

export type MexicoCalendarDay = {
  year: number;
  month: number; // 1-12
  day: number;
  /** 0 = domingo … 6 = sábado (igual que Date#getDay) */
  weekday: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getMexicoCalendarDay(date: Date): MexicoCalendarDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MEXICO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  const weekdayMap: Record<string, number> = {
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

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): number {
  // Encuentra el n-ésimo weekday (0=domingo) del mes usando UTC noon como ancla.
  const first = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** Transmisión del Poder Ejecutivo (LFT): Dic 1 hasta 2018; desde 2024, Oct 1. */
function isPresidentialTransitionHoliday(year: number, month: number, day: number): boolean {
  if (year >= 2024) {
    return month === 10 && day === 1 && (year - 2024) % 6 === 0;
  }
  return month === 12 && day === 1 && (year - 2018) % 6 === 0;
}

export function isMexicanMandatoryRestHoliday(date: Date): boolean {
  const { year, month, day, weekday } = getMexicoCalendarDay(date);

  // Fijos
  if (month === 1 && day === 1) return true; // Año Nuevo
  if (month === 5 && day === 1) return true; // Día del Trabajo
  if (month === 9 && day === 16) return true; // Independencia
  if (month === 12 && day === 25) return true; // Navidad
  if (isPresidentialTransitionHoliday(year, month, day)) return true;

  // Lunes festivos
  if (weekday === 1) {
    if (month === 2 && day === nthWeekdayOfMonth(year, 2, 1, 1)) return true; // Constitución
    if (month === 3 && day === nthWeekdayOfMonth(year, 3, 1, 3)) return true; // Benito Juárez
    if (month === 11 && day === nthWeekdayOfMonth(year, 11, 1, 3)) return true; // Revolución
  }

  return false;
}

export function isMexicanNonBusinessDay(date: Date): boolean {
  const { weekday } = getMexicoCalendarDay(date);
  if (weekday === 0 || weekday === 6) return true;
  return isMexicanMandatoryRestHoliday(date);
}

/**
 * paidAt + windowMs; si el vencimiento cae en no hábil (MX),
 * se suma 24h calendario hasta caer en día hábil (conserva la hora).
 */
export function getBusinessAwareDeadline(
  start: Date,
  windowMs: number,
): Date {
  let deadline = new Date(start.getTime() + windowMs);
  let guard = 0;
  while (isMexicanNonBusinessDay(deadline) && guard < 21) {
    deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
    guard += 1;
  }
  return deadline;
}
