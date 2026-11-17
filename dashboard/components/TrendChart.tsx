"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { bucket: string; sessions: number; visitors: number; leads: number };
type Metric = "sessions" | "visitors" | "leads";
const METRICS: { key: Metric; label: string }[] = [
  { key: "visitors", label: "People" },
  { key: "sessions", label: "Sessions" },
  { key: "leads", label: "Leads" },
];

const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 40 };

function niceMax(v: number) {
  if (v <= 4) return Math.max(1, v);
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function bucketLabel(b: string, unit: string, long = false) {
  const [d, t] = b.split(" ");
  const date = new Date(`${d}T12:00:00Z`);
  const md = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (unit === "hour") {
    const h = Number(t.slice(0, 2));
    const hl = `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    return long ? `${md}, ${hl}` : hl;
  }
  if (unit === "week") return long ? `Week of ${md}` : md;
  return long ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : md;
}

export default function TrendChart({ points, unit }: { points: Point[]; unit: "hour" | "day" | "week" }) {
  const [metric, setMetric] = useState<Metric>("visitors");
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.map((p) => p[metric]);
  const max = niceMax(Math.max(0, ...values));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, points.length);
  const barW = Math.max(1, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = useMemo(() => [0, max / 2, max].map((t) => Math.round(t * 10) / 10), [max]);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))));
  const total = values.reduce((a, b) => a + b, 0);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width - PAD.left;
    const i = Math.floor(x / slot);
    setHover(i >= 0 && i < points.length ? i : null);
  }

  const hp = hover != null ? points[hover] : null;

  return (
    <section className="card trend">
      <div className="card-head">
        <h3>
          {METRICS.find((m) => m.key === metric)!.label} per {unit}
          <span className="card-sub"> · {total.toLocaleString("en-US")} total{metric === "visitors" ? " (people counted once per " + unit + ")" : ""}</span>
        </h3>
        <div className="segmented" role="tablist" aria-label="Metric">
          {METRICS.map((m) => (
            <button key={m.key} role="tab" aria-selected={metric === m.key} className={metric === m.key ? "on" : ""} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="trend-plot" ref={ref}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`${metric} per ${unit}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t.toLocaleString("en-US")}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const v = p[metric];
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const h = (v / max) * innerH;
            const r = Math.min(4, barW / 2, h);
            const top = PAD.top + innerH - h;
            const base = PAD.top + innerH;
            return (
              <g key={p.bucket}>
                {hover === i && <rect className="hover-band" x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} />}
                {v > 0 && (
                  <path
                    className={`col${hover != null && hover !== i ? " dim" : ""}`}
                    d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text className="axis" x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle">{bucketLabel(p.bucket, unit)}</text>
                )}
              </g>
            );
          })}
          <line className="baseline" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} />
        </svg>
        {hp && (
          <div
            className="tooltip"
            style={{ left: `${Math.min(width - 170, Math.max(0, PAD.left + hover! * slot + slot / 2 - 80))}px` }}
          >
            <div className="tt-title">{bucketLabel(hp.bucket, unit, true)}</div>
            <div className="tt-row"><span>People</span><b>{hp.visitors}</b></div>
            <div className="tt-row"><span>Sessions</span><b>{hp.sessions}</b></div>
            <div className="tt-row"><span>Leads</span><b>{hp.leads}</b></div>
          </div>
        )}
      </div>
      <details className="table-view">
        <summary>Show as table</summary>
        <table>
          <thead><tr><th>{unit === "hour" ? "Hour" : unit === "week" ? "Week" : "Day"}</th><th>People</th><th>Sessions</th><th>Leads</th></tr></thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.bucket}><td>{bucketLabel(p.bucket, unit, true)}</td><td>{p.visitors}</td><td>{p.sessions}</td><td>{p.leads}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
