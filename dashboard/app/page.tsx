import Link from "next/link";
import BarList, { type BarItem } from "@/components/BarList";
import FilterBar from "@/components/FilterBar";
import Shell, { SetupNotice } from "@/components/Shell";
import SessionTable from "@/components/SessionTable";
import TrendChart from "@/components/TrendChart";
import { href, parseFilters, rangeLabel, type Filters } from "@/lib/filters";
import { compact, delta, num, pct } from "@/lib/format";
import { CONCLUSION_LABELS, CUSTOMER_LABELS, REQUEST_LABELS, TOPIC_LABELS, countryName, label, regionName } from "@/lib/labels";
import { load } from "@/lib/load";
import { bounds, headline, overview, sessions, type Bounds, type Kpi, type Row } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const res = await load(async () => {
    const b = await bounds(f);
    const [kpis, o, recent] = await Promise.all([headline(f), overview(f, b), sessions(f, b, 1, 8)]);
    return { b, kpis, o, recent };
  });

  return (
    <Shell active="overview" exportHref={href("/api/export", f)}>
      <FilterBar f={f} path="/" />
      {res.notice ? <SetupNotice kind={res.notice} /> : <Body f={f} {...res.data} />}
    </Shell>
  );
}

type Data = {
  f: Filters;
  b: Bounds;
  kpis: Kpi[];
  o: Awaited<ReturnType<typeof overview>>;
  recent: Awaited<ReturnType<typeof sessions>>;
};

function Body({ f, b, kpis, o, recent }: Data) {
  const t = o.totals;
  const go = (over: Partial<Filters>) => href("/", f, over);
  const items = (rows: Row[], name: (r: Row) => string, link?: (r: Row) => Partial<Filters>, active?: (r: Row) => boolean): BarItem[] =>
    rows.map((r) => ({ label: name(r), value: r.n, href: link ? go(link(r)) : undefined, active: active?.(r) }));

  return (
    <>
      <section className="kpis" aria-label="Usage">
        {kpis.map((k) => {
          const d = delta(k.visitors, k.prevVisitors);
          return (
            <div className="kpi" key={k.key}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{compact(k.visitors)} <span className="kpi-unit">{k.visitors === 1 ? "person" : "people"}</span></div>
              <div className="kpi-meta">
                <span>{num(k.sessions)} {k.sessions === 1 ? "session" : "sessions"}</span>
                <span className={`delta ${d.dir}`} title={`${num(k.prevVisitors)} people in the ${k.prevLabel}`}>
                  {d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "•"} {d.text} <span className="muted">vs {k.prevLabel}</span>
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <h2 className="section-title">{rangeLabel(f)}</h2>
      <section className="stats" aria-label="Selected range summary">
        <Stat label="Sessions" value={num(t.sessions)} />
        <Stat label="People" value={num(t.visitors)} sub={`${num(t.returning)} returning`} />
        <Stat label="Engaged" value={pct(t.engaged, t.sessions)} sub="sent 2+ messages" />
        <Stat label="Got a recommendation" value={num(t.recommended)} sub={pct(t.recommended, t.sessions) + " of sessions"} />
        <Stat label="Leads sent to sales" value={num(t.leads)} sub={pct(t.leads, t.sessions) + " of sessions"} />
        <Stat label="Messages per session" value={String(t.avgMessages)} sub="from the visitor" />
      </section>

      <TrendChart points={o.trend} unit={b.unit} />

      <div className="grid">
        <BarList
          title="Countries"
          total={t.sessions}
          items={items(o.countries, (r) => countryName(r.key), (r) => (r.key ? { country: r.key, region: undefined } : {}), (r) => r.key === f.country)}
        />
        <BarList
          title="States & provinces"
          total={t.sessions}
          items={o.regions.map((r) => ({
            label: regionName(r.key2 ?? null, r.key),
            sub: r.key2 && r.key2 !== "US" ? countryName(r.key2) : undefined,
            value: r.n,
            href: go({ country: r.key2 ?? undefined, region: r.key ?? undefined }),
            active: r.key === f.region,
          }))}
        />
        <BarList title="Cities" total={t.sessions} items={o.cities.map((r) => ({ label: r.key ?? "Unknown", sub: r.key2 ?? undefined, value: r.n }))} />

        <BarList
          title="Session conclusions"
          note="How each conversation ended"
          total={t.sessions}
          items={items(o.conclusions, (r) => label(CONCLUSION_LABELS, r.key), (r) => (r.key ? { conclusion: r.key } : {}), (r) => r.key === f.conclusion)}
        />
        <BarList
          title="Products discussed"
          note="Sessions mentioning each product line"
          total={t.sessions}
          items={items(o.productsDiscussed, (r) => r.key ?? "", (r) => ({ product: r.key ?? undefined }), (r) => r.key === f.product)}
        />
        <BarList title="Products recommended" note="Exact sizes from the decision tree" total={t.recommended} items={items(o.productsRecommended, (r) => r.key ?? "")} />

        <BarList
          title="Topics"
          total={t.sessions}
          items={items(o.topics, (r) => label(TOPIC_LABELS, r.key), (r) => ({ topic: r.key ?? undefined }), (r) => r.key === f.topic)}
        />
        <BarList title="Applications" note="First answer in the product guide" total={t.sessions} items={items(o.applications, (r) => r.key ?? "")} />
        <BarList title="Who's asking" total={t.sessions} items={items(o.customers, (r) => (r.key ? label(CUSTOMER_LABELS, r.key) : "Not classified"))} />

        <BarList title="Lead requests" total={t.leads} empty="No leads in this range" items={items(o.requests, (r) => label(REQUEST_LABELS, r.key ?? "other"))} />
        <BarList title="Visitor sentiment" total={t.sessions} items={items(o.sentiment, (r) => (r.key ? r.key[0].toUpperCase() + r.key.slice(1) : "Not classified"))} />
        <BarList title="Pages where chats started" total={t.sessions} items={items(o.pages, (r) => (r.key ?? "").replace(/^https?:\/\/(www\.)?/, ""))} />
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Latest sessions</h3>
          <Link href={href("/sessions", f)} className="link">See all {num(t.sessions)} →</Link>
        </div>
        <SessionTable rows={recent.rows} />
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
