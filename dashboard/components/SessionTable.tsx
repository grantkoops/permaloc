import Link from "next/link";
import { TZ } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { CONCLUSION_LABELS, label } from "@/lib/labels";
import type { SessionRow } from "@/lib/queries";

export default function SessionTable({ rows }: { rows: SessionRow[] }) {
  if (!rows.length) return <p className="empty">No sessions match these filters.</p>;
  return (
    <div className="table-wrap">
      <table className="sessions">
        <thead>
          <tr>
            <th>Started</th>
            <th>Location</th>
            <th className="num">Msgs</th>
            <th>Conclusion</th>
            <th>Products</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="nowrap"><Link href={`/sessions/${r.id}`}>{dateTime(r.started_at, TZ)}</Link></td>
              <td>{[r.city, r.region, r.country].filter(Boolean).join(", ") || "Unknown"}</td>
              <td className="num">{r.user_messages}</td>
              <td><span className={`pill c-${r.conclusion ?? "none"}`}>{label(CONCLUSION_LABELS, r.conclusion)}</span></td>
              <td>{r.products.join(", ") || "–"}</td>
              <td className="summary">{r.summary ?? <span className="muted">Not classified</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
