export const num = (n: number) => n.toLocaleString("en-US");

export function compact(n: number) {
  if (n < 10_000) return num(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

export function delta(cur: number, prev: number) {
  if (!prev) return cur ? { text: "new", dir: "up" as const } : { text: "no change", dir: "flat" as const };
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: `${d > 0 ? "+" : ""}${d}%`, dir: d > 0 ? ("up" as const) : d < 0 ? ("down" as const) : ("flat" as const) };
}

export function dateTime(d: Date, tz: string) {
  return d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function duration(a: Date, b: Date) {
  const m = Math.round((b.getTime() - a.getTime()) / 60000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
