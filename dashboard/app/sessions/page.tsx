import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import SessionTable from "@/components/SessionTable";
import Shell, { SetupNotice } from "@/components/Shell";
import { href, parseFilters, rangeLabel } from "@/lib/filters";
import { num } from "@/lib/format";
import { load } from "@/lib/load";
import { bounds, sessions } from "@/lib/queries";

export const dynamic = "force-dynamic";
const PER_PAGE = 50;

export default async function Sessions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const page = Math.max(1, Math.min(1000, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const res = await load(async () => sessions(f, await bounds(f), page, PER_PAGE));
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / PER_PAGE)) : 1;
  const pageHref = (p: number) => {
    const base = href("/sessions", f);
    return p === 1 ? base : `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  };

  return (
    <Shell active="sessions" exportHref={href("/api/export", f)}>
      <FilterBar f={f} path="/sessions" />
      <form className="search" action="/sessions" method="get">
        {Object.entries({ range: f.range === "custom" ? undefined : f.range, from: f.from, to: f.to, country: f.country, region: f.region, conclusion: f.conclusion, product: f.product, topic: f.topic })
          .filter(([, v]) => v)
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="search" name="q" defaultValue={f.q} placeholder="Search summaries and transcripts…" aria-label="Search sessions" />
        <button type="submit">Search</button>
      </form>
      {res.notice ? (
        <SetupNotice kind={res.notice} />
      ) : (
        <section className="card">
          <div className="card-head">
            <h3>{num(res.data.total)} sessions <span className="card-sub">· {rangeLabel(f)}</span></h3>
            {pages > 1 && (
              <nav className="pager" aria-label="Pages">
                {page > 1 ? <Link href={pageHref(page - 1)}>← Newer</Link> : <span />}
                <span className="muted">Page {page} of {pages}</span>
                {page < pages ? <Link href={pageHref(page + 1)}>Older →</Link> : <span />}
              </nav>
            )}
          </div>
          <SessionTable rows={res.data.rows} />
        </section>
      )}
    </Shell>
  );
}
