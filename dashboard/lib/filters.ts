// Dashboard filters live in the URL so every view can be bookmarked and shared.

export const RANGES = [
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "mtd", label: "This month" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"] | "custom";

export type Filters = {
  range: RangeKey;
  from?: string; // YYYY-MM-DD, for custom
  to?: string;
  country?: string;
  region?: string;
  conclusion?: string;
  product?: string;
  topic?: string;
  q?: string;
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Za-z0-9_ .'-]{1,60}$/;

export function parseFilters(sp: SP): Filters {
  const from = one(sp.from);
  const to = one(sp.to);
  let range = one(sp.range) as RangeKey | undefined;
  if (from && DATE.test(from)) range = "custom";
  if (!range || (range !== "custom" && !RANGES.some((r) => r.key === range))) range = "30d";
  const code = (v?: string) => (v && CODE.test(v) ? v : undefined);
  return {
    range,
    from: range === "custom" && from && DATE.test(from) ? from : undefined,
    to: range === "custom" && to && DATE.test(to) ? to : undefined,
    country: code(one(sp.country))?.toUpperCase(),
    region: code(one(sp.region))?.toUpperCase(),
    conclusion: code(one(sp.conclusion)),
    product: code(one(sp.product)),
    topic: code(one(sp.topic)),
    q: one(sp.q)?.slice(0, 100),
  };
}

/** Build a query string from filters, with overrides (undefined removes a key). */
export function href(path: string, f: Filters, over: Partial<Filters> = {}) {
  const m = { ...f, ...over };
  const p = new URLSearchParams();
  if (m.range === "custom") {
    if (m.from) p.set("from", m.from);
    if (m.to) p.set("to", m.to);
  } else if (m.range !== "30d") p.set("range", m.range);
  for (const k of ["country", "region", "conclusion", "product", "topic", "q"] as const) if (m[k]) p.set(k, m[k]!);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export function rangeLabel(f: Filters) {
  if (f.range === "custom") return `${f.from ?? "…"} to ${f.to ?? "today"}`;
  return RANGES.find((r) => r.key === f.range)!.label;
}
