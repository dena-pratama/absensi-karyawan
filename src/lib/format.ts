const TZ = "Asia/Jakarta";

/** Tanggal hari ini (WIB) dalam format YYYY-MM-DD. */
export function todayWIB(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** "08:15 WIB" */
export function formatTimeWIB(iso: string): string {
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${time.replace(".", ":")} WIB`;
}

/** "Selasa, 20 Okt 2026" dari YYYY-MM-DD */
export function formatDateLong(ymd: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${ymd}T00:00:00Z`));
}

/** "Nadia Paramitha" → "NP", "Nadia" → "NA" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ------------------------------ Bulan & tanggal ------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/** Validasi "YYYY-MM-DD"; kembalikan fallback kalau tidak valid. */
export function parseDateParam(value: string | undefined, fallback: string): string {
  if (!value || !ISO_DATE.test(value)) return fallback;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? fallback : value;
}

/** Validasi "YYYY-MM"; kembalikan fallback kalau tidak valid. */
export function parseMonthParam(value: string | undefined, fallback: string): string {
  if (!value || !ISO_MONTH.test(value)) return fallback;
  const m = Number(value.slice(5));
  return m >= 1 && m <= 12 ? value : fallback;
}

export function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

/** Rentang tanggal 1 s/d akhir bulan untuk "YYYY-MM". */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, "0")}`, days };
}

/** Geser tanggal "YYYY-MM-DD" sebanyak `delta` hari. */
export function shiftDay(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "Oktober 2026" */
export function formatMonthLong(month: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/** "Okt" */
export function formatMonthShort(month: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "short" }).format(new Date(`${month}-01T00:00:00Z`));
}

const WEEKDAY_SHORT = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];

/** Hari dalam bulan: { day, date, weekday ("Sn"), isWeekend } */
export function daysOfMonth(month: string) {
  const { days } = monthRange(month);
  return Array.from({ length: days }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { day: i + 1, date, weekday: WEEKDAY_SHORT[dow], dow, isWeekend: dow === 0 || dow === 6 };
  });
}

/** "20 / 10 / 2026" */
export function formatDateSlash(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d} / ${m} / ${y}`;
}

/** "Rp769.230" */
export function formatRupiah(n: number): string {
  return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`;
}

/** "20 Okt 2026" dari YYYY-MM-DD */
export function formatDateShort(ymd: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );
}
