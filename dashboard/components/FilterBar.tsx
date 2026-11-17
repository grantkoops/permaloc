import Link from "next/link";
import { RANGES, href, type Filters } from "@/lib/filters";
import { CONCLUSION_LABELS, TOPIC_LABELS, countryName, label, regionName } from "@/lib/labels";
import CustomRange from "./CustomRange";

export default function FilterBar({ f, path }: { f: Filters; path: string }) {
  const chips: { text: string; remove: Partial<Filters> }[] = [];
  if (f.country) chips.push({ text: `Country: ${countryName(f.country)}`, remove: { country: undefined, region: undefined } });
  if (f.region) chips.push({ text: `State/province: ${regionName(f.country ?? null, f.region)}`, remove: { region: undefined } });
  if (f.conclusion) chips.push({ text: `Conclusion: ${label(CONCLUSION_LABELS, f.conclusion)}`, remove: { conclusion: undefined } });
  if (f.product) chips.push({ text: `Product: ${f.product}`, remove: { product: undefined } });
  if (f.topic) chips.push({ text: `Topic: ${label(TOPIC_LABELS, f.topic)}`, remove: { topic: undefined } });
  if (f.q) chips.push({ text: `Search: “${f.q}”`, remove: { q: undefined } });

  return (
    <div className="filters">
      <nav className="segmented ranges" aria-label="Date range">
        {RANGES.map((r) => (
          <Link key={r.key} href={href(path, f, { range: r.key, from: undefined, to: undefined })} className={f.range === r.key ? "on" : ""} aria-current={f.range === r.key ? "true" : undefined}>
            {r.label}
          </Link>
        ))}
      </nav>
      <CustomRange from={f.from} to={f.to} active={f.range === "custom"} />
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <Link key={c.text} className="chip" href={href(path, f, c.remove)} title="Remove filter">
              {c.text} <span aria-hidden>✕</span>
            </Link>
          ))}
          {chips.length > 1 && (
            <Link className="chip clear" href={href(path, { range: f.range, from: f.from, to: f.to })}>Clear all</Link>
          )}
        </div>
      )}
    </div>
  );
}
