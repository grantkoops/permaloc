import Link from "next/link";
import { num, pct } from "@/lib/format";

export type BarItem = { label: string; sub?: string; value: number; href?: string; active?: boolean };

/** Ranked horizontal bars. Each row can link to a filtered view. */
export default function BarList({ title, items, total, empty = "No data in this range", note }: { title: string; items: BarItem[]; total: number; empty?: string; note?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <section className="card">
      <h3>{title}</h3>
      {note && <p className="card-note">{note}</p>}
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ol className="bars">
          {items.map((it) => {
            const inner = (
              <>
                <span className="bar-label">
                  {it.label}
                  {it.sub && <span className="bar-sub"> {it.sub}</span>}
                </span>
                <span className="bar-value">
                  {num(it.value)} <span className="bar-share">{pct(it.value, total)}</span>
                </span>
                <span className="bar-track" aria-hidden>
                  <span className="bar-fill" style={{ width: `${(it.value / max) * 100}%` }} />
                </span>
              </>
            );
            const tip = `${it.label}${it.sub ? ` ${it.sub}` : ""}: ${num(it.value)} (${pct(it.value, total)})`;
            return (
              <li key={it.label + (it.sub ?? "")} className={it.active ? "active" : undefined}>
                {it.href ? (
                  <Link href={it.href} title={`${tip}. Click to filter`} scroll={false}>{inner}</Link>
                ) : (
                  <div title={tip}>{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
