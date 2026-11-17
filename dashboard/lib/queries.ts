import type { Fragment } from "postgres";
import { db, TZ } from "./db";
import type { Filters } from "./filters";

type Sql = NonNullable<ReturnType<typeof db>>;

export class NotConfigured extends Error {}

function conn(): Sql {
  const sql = db();
  if (!sql) throw new NotConfigured("DATABASE_URL is not set");
  return sql;
}

/** True when the chatbot hasn't created the table yet (no conversations recorded). */
export function isMissingTable(e: unknown) {
  return (e as { code?: string })?.code === "42P01";
}

export type Bounds = { start: Date; end: Date; unit: "hour" | "day" | "week" };

/** Resolve the selected range to absolute times, using the dashboard's time zone for calendar ranges. */
export async function bounds(f: Filters): Promise<Bounds> {
  const sql = conn();
  let startExpr: Fragment;
  let endExpr: Fragment = sql`now()`;
  switch (f.range) {
    case "24h":
      startExpr = sql`now() - interval '24 hours'`;
      break;
    case "7d":
      startExpr = sql`now() - interval '7 days'`;
      break;
    case "mtd":
      startExpr = sql`date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}`;
      break;
    case "ytd":
      startExpr = sql`date_trunc('year', now() at time zone ${TZ}) at time zone ${TZ}`;
      break;
    case "all":
      startExpr = sql`coalesce((select min(started_at) from chat_sessions), now() - interval '1 day')`;
      break;
    case "custom":
      startExpr = sql`(${f.from ?? "2000-01-01"}::date)::timestamp at time zone ${TZ}`;
      endExpr = f.to ? sql`least(now(), ((${f.to}::date + 1))::timestamp at time zone ${TZ})` : sql`now()`;
      break;
    default:
      startExpr = sql`now() - interval '30 days'`;
  }
  const [r] = await sql<{ start: Date; end: Date }[]>`select ${startExpr} as start, ${endExpr} as "end"`;
  const days = (r.end.getTime() - r.start.getTime()) / 86400_000;
  return { start: r.start, end: r.end, unit: days <= 2 ? "hour" : days <= 120 ? "day" : "week" };
}

/** Filters other than time. */
function dims(sql: Sql, f: Filters): Fragment {
  return sql`
    ${f.country ? sql`and country = ${f.country}` : sql``}
    ${f.region ? sql`and region = ${f.region}` : sql``}
    ${f.conclusion ? sql`and coalesce(conclusion, outcome) = ${f.conclusion}` : sql``}
    ${f.product ? sql`and ${f.product} = any(products)` : sql``}
    ${f.topic ? sql`and ${f.topic} = any(topics)` : sql``}
    ${f.q ? sql`and (summary ilike ${"%" + f.q + "%"} or transcript::text ilike ${"%" + f.q + "%"})` : sql``}`;
}

function where(sql: Sql, f: Filters, b: Bounds): Fragment {
  return sql`where started_at >= ${b.start} and started_at < ${b.end} ${dims(sql, f)}`;
}

export type Kpi = { key: string; label: string; sessions: number; visitors: number; prevSessions: number; prevVisitors: number; prevLabel: string };

/** Headline usage for fixed windows (24h / 7d / 30d / YTD) with the period before each, honoring non-time filters. */
export async function headline(f: Filters): Promise<Kpi[]> {
  const sql = conn();
  const visitor = sql`coalesce(visitor_id, id)`;
  const ytd = sql`date_trunc('year', now() at time zone ${TZ}) at time zone ${TZ}`;
  const ytdPrevStart = sql`(date_trunc('year', now() at time zone ${TZ}) - interval '1 year') at time zone ${TZ}`;
  const windows: [string, string, Fragment, Fragment, Fragment, string][] = [
    ["24h", "Past 24 hours", sql`now() - interval '24 hours'`, sql`now() - interval '48 hours'`, sql`now() - interval '24 hours'`, "prior 24 hours"],
    ["7d", "Past 7 days", sql`now() - interval '7 days'`, sql`now() - interval '14 days'`, sql`now() - interval '7 days'`, "prior 7 days"],
    ["30d", "Past 30 days", sql`now() - interval '30 days'`, sql`now() - interval '60 days'`, sql`now() - interval '30 days'`, "prior 30 days"],
    ["ytd", "Year to date", ytd, ytdPrevStart, sql`now() - interval '1 year'`, "same period last year"],
  ];
  const rows = await Promise.all(
    windows.map(
      ([, , start, pStart, pEnd]) => sql<{ s: number; v: number; ps: number; pv: number }[]>`
        select
          count(*) filter (where started_at >= ${start})::int as s,
          count(distinct ${visitor}) filter (where started_at >= ${start})::int as v,
          count(*) filter (where started_at >= ${pStart} and started_at < ${pEnd})::int as ps,
          count(distinct ${visitor}) filter (where started_at >= ${pStart} and started_at < ${pEnd})::int as pv
        from chat_sessions
        where started_at >= least(${start}, ${pStart}) ${dims(sql, f)}`,
    ),
  );
  return windows.map(([key, label, , , , prevLabel], i) => ({
    key,
    label,
    sessions: rows[i][0].s,
    visitors: rows[i][0].v,
    prevSessions: rows[i][0].ps,
    prevVisitors: rows[i][0].pv,
    prevLabel,
  }));
}

export type Totals = {
  sessions: number;
  visitors: number;
  returning: number;
  engaged: number;
  recommended: number;
  leads: number;
  avgMessages: number;
};

export type Row = { key: string | null; key2?: string | null; n: number };
export type TrendPoint = { bucket: string; sessions: number; visitors: number; leads: number };

export async function overview(f: Filters, b: Bounds) {
  const sql = conn();
  const w = where(sql, f, b);
  const top = (expr: Fragment, limit = 10, from: Fragment = sql`chat_sessions`) =>
    sql<Row[]>`select ${expr} as key, count(*)::int as n from ${from} ${w} group by 1 order by 2 desc, 1 limit ${limit}`;
  const unit = b.unit;

  const [totals, trend, countries, regions, cities, conclusions, productsDiscussed, productsRecommended, applications, topics, customers, requests, sentiment, pages] =
    await Promise.all([
      sql<Totals[]>`
        select count(*)::int as sessions,
          count(distinct coalesce(visitor_id, id))::int as visitors,
          count(distinct visitor_id) filter (where visitor_id in (select visitor_id from chat_sessions where started_at < ${b.start}))::int as returning,
          count(*) filter (where user_messages >= 2)::int as engaged,
          count(*) filter (where recommended_product is not null)::int as recommended,
          count(*) filter (where lead_submitted)::int as leads,
          coalesce(round(avg(user_messages)::numeric, 1), 0)::float as "avgMessages"
        from chat_sessions ${w}`,
      sql<TrendPoint[]>`
        with buckets as (
          select generate_series(
            date_trunc(${unit}, ${b.start}::timestamptz at time zone ${TZ}),
            date_trunc(${unit}, ${b.end}::timestamptz at time zone ${TZ}),
            ${"1 " + unit}::interval) as bucket
        ), s as (
          select date_trunc(${unit}, started_at at time zone ${TZ}) as bucket, id, coalesce(visitor_id, id) as visitor, lead_submitted
          from chat_sessions ${w}
        )
        select to_char(buckets.bucket, ${unit === "hour" ? "YYYY-MM-DD HH24:00" : "YYYY-MM-DD"}) as bucket,
          count(s.id)::int as sessions, count(distinct s.visitor)::int as visitors, count(s.id) filter (where s.lead_submitted)::int as leads
        from buckets left join s on s.bucket = buckets.bucket
        group by buckets.bucket order by buckets.bucket`,
      top(sql`country`, 12),
      sql<Row[]>`select region as key, country as key2, count(*)::int as n from chat_sessions ${w} and region is not null
        group by 1, 2 order by 3 desc, 1 limit 12`,
      sql<Row[]>`select city as key, coalesce(region, country) as key2, count(*)::int as n from chat_sessions ${w} and city is not null
        group by 1, 2 order by 3 desc, 1 limit 10`,
      top(sql`coalesce(conclusion, outcome)`, 12),
      top(sql`p`, 14, sql`chat_sessions cross join lateral unnest(products) as p`),
      top(sql`recommended_product`, 10, sql`chat_sessions`).then((r) => r.filter((x) => x.key)),
      top(sql`application`, 12).then((r) => r.filter((x) => x.key)),
      top(sql`t`, 12, sql`chat_sessions cross join lateral unnest(topics) as t`),
      top(sql`coalesce(lead_customer_type, customer_type)`, 8),
      sql<Row[]>`select lead_request_type as key, count(*)::int as n from chat_sessions ${w} and lead_submitted group by 1 order by 2 desc limit 8`,
      top(sql`sentiment`, 4),
      top(sql`page_url`, 8).then((r) => r.filter((x) => x.key)),
    ]);

  return { totals: totals[0], trend, countries, regions, cities, conclusions, productsDiscussed, productsRecommended, applications, topics, customers, requests, sentiment, pages };
}

export type SessionRow = {
  id: string;
  started_at: Date;
  last_message_at: Date;
  user_messages: number;
  country: string | null;
  region: string | null;
  city: string | null;
  conclusion: string | null;
  products: string[];
  recommended_product: string | null;
  lead_submitted: boolean;
  summary: string | null;
  customer_type: string | null;
  sentiment: string | null;
};

export async function sessions(f: Filters, b: Bounds, page = 1, perPage = 50) {
  const sql = conn();
  const w = where(sql, f, b);
  const [rows, [{ total }]] = await Promise.all([
    sql<SessionRow[]>`
      select id, started_at, last_message_at, user_messages, country, region, city, coalesce(conclusion, outcome) as conclusion,
        products, recommended_product, lead_submitted, summary, coalesce(lead_customer_type, customer_type) as customer_type, sentiment
      from chat_sessions ${w} order by started_at desc limit ${perPage} offset ${(page - 1) * perPage}`,
    sql<{ total: number }[]>`select count(*)::int as total from chat_sessions ${w}`,
  ]);
  return { rows, total };
}

export type SessionDetail = SessionRow & {
  visitor_id: string | null;
  page_url: string | null;
  application: string | null;
  tools_used: string[];
  topics: string[];
  lead_request_type: string | null;
  transferred_to_specialist: boolean;
  rep_lookup_region: string | null;
  transcript: { role: string; content: string }[] | null;
  visitor_sessions: number;
};

export async function session(id: string) {
  const sql = conn();
  const [row] = await sql<SessionDetail[]>`
    select s.*, coalesce(s.conclusion, s.outcome) as conclusion, coalesce(s.lead_customer_type, s.customer_type) as customer_type,
      (select count(*)::int from chat_sessions o where o.visitor_id = s.visitor_id) as visitor_sessions
    from chat_sessions s where s.id = ${id}`;
  return row ?? null;
}

/** Streams every matching session for CSV export. */
export async function exportRows(f: Filters, b: Bounds) {
  const sql = conn();
  return sql`
    select id, started_at, last_message_at, user_messages, country, region, city, page_url, application, recommended_product,
      array_to_string(products, '; ') as products, array_to_string(topics, '; ') as topics, coalesce(conclusion, outcome) as conclusion,
      lead_submitted, lead_request_type, coalesce(lead_customer_type, customer_type) as customer_type, sentiment, summary
    from chat_sessions ${where(sql, f, b)} order by started_at desc limit 50000`;
}
