"use client";

import { useId } from "react";
import type { DiagramSpec, Layer, Material } from "@/lib/diagramTypes";

// Illustrative cross-section, drawn to scale in inches. Labels are numbered markers
// in the drawing with a readable list beneath, so it works at chat-bubble width.

const S = 18; // px per inch
const OUT_W = 5; // inches of ground drawn on the outside of the edging
const IN_W = 7; // inches drawn on the inside (room for restraint flanges)
const PAD = 10;

const FILL: Record<Material, string> = {
  turf: "#cfe3c3",
  mulch: "#dcc3a4",
  stone: "#d9dcdf",
  aggregate: "#e4e6e8",
  sand: "#f0e3c4",
  setting: "#eadcb8",
  paver: "#d8a48f",
  concrete: "#e5e5e2",
  asphalt: "#5f6368",
  rubber: "#b5654f",
  base: "#d3d6d9",
  openbase: "#e9ebed",
  soil: "#e8dccb",
  growing: "#8a7158",
  tray: "#c9d3c4",
};

type Marker = { n: number; x: number; y: number; text: string };

function wrapPatterns(id: string) {
  const p = (name: string) => `${id}-${name}`;
  return {
    defs: (
      <defs>
        <pattern id={p("mulch")} width="10" height="8" patternUnits="userSpaceOnUse">
          <rect width="10" height="8" fill={FILL.mulch} />
          <path d="M1 2 l4 1 M6 6 l3 -2 M2 7 l2 -1" stroke="#9b7653" strokeWidth="1.1" strokeLinecap="round" />
        </pattern>
        <pattern id={p("stone")} width="12" height="10" patternUnits="userSpaceOnUse">
          <rect width="12" height="10" fill={FILL.stone} />
          <circle cx="3.5" cy="3" r="2.4" fill="#f4f5f6" stroke="#8d939a" strokeWidth=".8" />
          <circle cx="9" cy="7.5" r="2" fill="#f4f5f6" stroke="#8d939a" strokeWidth=".8" />
        </pattern>
        <pattern id={p("aggregate")} width="8" height="7" patternUnits="userSpaceOnUse">
          <rect width="8" height="7" fill={FILL.aggregate} />
          <circle cx="2" cy="2" r="1.2" fill="none" stroke="#8d939a" strokeWidth=".7" />
          <circle cx="6" cy="5" r="1.4" fill="none" stroke="#8d939a" strokeWidth=".7" />
        </pattern>
        <pattern id={p("base")} width="16" height="14" patternUnits="userSpaceOnUse">
          <rect width="16" height="14" fill={FILL.base} />
          <circle cx="4" cy="4" r="2.6" fill="none" stroke="#7d838a" strokeWidth=".8" />
          <circle cx="12" cy="10" r="3" fill="none" stroke="#7d838a" strokeWidth=".8" />
          <circle cx="12" cy="2.5" r="1" fill="#7d838a" />
          <circle cx="3" cy="11" r="1" fill="#7d838a" />
        </pattern>
        <pattern id={p("openbase")} width="18" height="16" patternUnits="userSpaceOnUse">
          <rect width="18" height="16" fill={FILL.openbase} />
          <circle cx="5" cy="5" r="4" fill="#fff" stroke="#7d838a" strokeWidth=".8" />
          <circle cx="13.5" cy="12" r="3.6" fill="#fff" stroke="#7d838a" strokeWidth=".8" />
        </pattern>
        <pattern id={p("sand")} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={FILL.sand} />
          <circle cx="1.5" cy="1.5" r=".6" fill="#b49a64" />
          <circle cx="4.5" cy="4" r=".6" fill="#b49a64" />
        </pattern>
        <pattern id={p("setting")} width="6" height="5" patternUnits="userSpaceOnUse">
          <rect width="6" height="5" fill={FILL.setting} />
          <circle cx="2" cy="2" r=".9" fill="none" stroke="#a48d5c" strokeWidth=".6" />
        </pattern>
        <pattern id={p("concrete")} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill={FILL.concrete} />
          <path d="M0 12 L12 0" stroke="#b7b7b2" strokeWidth=".8" />
          <circle cx="3" cy="4" r=".8" fill="#9a9a95" />
          <path d="M8 8 l1.6 0 l-.8 -1.4z" fill="#9a9a95" />
        </pattern>
        <pattern id={p("asphalt")} width="10" height="5" patternUnits="userSpaceOnUse">
          <rect width="10" height="5" fill={FILL.asphalt} />
          <path d="M0 2.5 H10" stroke="#7b8085" strokeWidth=".8" />
          <circle cx="7" cy="1" r=".6" fill="#9aa0a6" />
        </pattern>
        <pattern id={p("rubber")} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={FILL.rubber} />
          <circle cx="2" cy="2" r=".8" fill="#d48a74" />
          <circle cx="5" cy="5" r=".7" fill="#7f3f2f" />
        </pattern>
        <pattern id={p("soil")} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill={FILL.soil} />
          <path d="M0 10 L10 0 M-2 2 L2 -2 M8 12 L12 8" stroke="#c7b394" strokeWidth=".8" />
        </pattern>
        <pattern id={p("growing")} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill={FILL.growing} />
          <circle cx="2" cy="3" r=".9" fill="#b39a7d" />
          <circle cx="6" cy="6" r=".7" fill="#5e4a37" />
        </pattern>
        <pattern id={p("tray")} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill={FILL.tray} />
          <path d="M0 8 L8 0" stroke="#93a28c" strokeWidth=".8" />
        </pattern>
      </defs>
    ),
    fill: (m: Material) => (m === "turf" ? `url(#${p("soil")})` : m === "paver" ? FILL.paver : `url(#${p(m)})`),
  };
}

/** Inches as builders write them: 1.625 -> 1-5/8", 5.5 -> 5-1/2", 0.75 -> 3/4". */
function fmt(n: number) {
  const eighths = Math.round(n * 8);
  const whole = Math.floor(eighths / 8);
  let num = eighths % 8;
  let den = 8;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (!num) return `${whole}"`;
  return whole ? `${whole}-${num}/${den}"` : `${num}/${den}"`;
}

export default function CrossSection({ spec }: { spec: DiagramSpec }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { defs, fill } = wrapPatterns(uid);
  const { product, anchor } = spec;
  const H = product.height;
  const isVertical = product.kind === "vertical";
  const isGeo = product.kind === "geoedge";
  const markers: Marker[] = [];
  let n = 0;
  const mark = (x: number, y: number, text: string) => markers.push({ n: ++n, x, y, text });

  // Where the edging sits. Restraints and PermaStrip sit with their flange under the
  // retained layers (bottom of the setting course / asphalt / aggregate).
  const sumUntil = (layers: Layer[], stop: (l: Layer) => boolean) => {
    let y = 0;
    for (const l of layers) {
      if (stop(l)) break;
      y += l.thickness;
    }
    return y;
  };
  let wallTop: number;
  let wallBottom: number;
  if (isVertical) {
    wallTop = -0.5;
    wallBottom = wallTop + H;
  } else if (isGeo) {
    wallTop = 0;
    wallBottom = H;
  } else if (product.kind === "permastrip") {
    wallTop = -0.5;
    wallBottom = wallTop + H;
  } else {
    wallBottom = sumUntil(spec.inside, (l) => ["base", "concrete", "openbase", "soil"].includes(l.material));
    if (wallBottom <= 0) wallBottom = H;
    wallTop = wallBottom - H;
  }

  const anchorBottom =
    anchor.type === "stake" ? wallTop + 0.6 + anchor.length : anchor.type === "spike" ? wallBottom - 0.2 + anchor.length : wallBottom + 1;
  const bottom = Math.max(anchorBottom, wallBottom, isGeo ? H : 0) + (isGeo ? 2.2 : 1.2);
  const top = Math.min(wallTop, 0) - 1.3;

  const xEdge = PAD + OUT_W * S; // px
  const W = PAD * 2 + (OUT_W + IN_W) * S;
  const y = (inches: number) => (inches - top) * S;
  const Hpx = y(bottom);

  // ---- layer bands ----
  const bands: React.ReactNode[] = [];
  const drawSide = (layers: Layer[], side: "in" | "out", startY: number) => {
    const x0 = side === "in" ? xEdge : PAD;
    const x1 = side === "in" ? W - PAD : xEdge;
    let cur = startY;
    layers.forEach((l, i) => {
      const fillToBottom = l.thickness === 0;
      const t = fillToBottom ? bottom - cur : l.thickness;
      if (t <= 0) return;
      bands.push(
        <rect key={`${side}${i}`} x={x0} y={y(cur)} width={x1 - x0} height={t * S} fill={fill(l.material)} stroke="#a1a7ad" strokeWidth={0.6} />,
      );
      if (l.material === "paver") {
        for (let x = x0 + 4 * S; x < x1; x += 4 * S) bands.push(<line key={`j${side}${i}${x}`} x1={x} x2={x} y1={y(cur)} y2={y(cur + t)} stroke="#9c6b58" strokeWidth={1} />);
      }
      if (l.material === "turf") {
        const blades: string[] = [];
        for (let x = x0 + 3; x < x1 - 2; x += 5) blades.push(`M${x} ${y(cur)} l-1.5 -${6 + ((x * 7) % 5)} M${x + 1} ${y(cur)} l1.8 -${5 + ((x * 3) % 4)}`);
        bands.push(<path key={`g${side}${i}`} d={blades.join(" ")} stroke="#4f8a3a" strokeWidth={1.1} fill="none" strokeLinecap="round" />);
        bands.push(<rect key={`tg${side}${i}`} x={x0} y={y(cur)} width={x1 - x0} height={t * S} fill={FILL.turf} opacity={0.75} />);
      }
      const label = fillToBottom ? (l.material === "soil" ? `${l.label}` : l.label) : `${l.label}`;
      const mx = side === "in" ? x0 + (x1 - x0) * 0.72 : x0 + (x1 - x0) * 0.35;
      mark(mx, y(cur + Math.min(t, 3) / 2), label);
      cur += t;
    });
    return cur;
  };

  if (isGeo) {
    // Roof: layers stack up from the waterproofing at the base of the GeoEdge.
    const roofY = wallBottom;
    bands.push(<rect key="deck" x={PAD} y={y(roofY + 0.25)} width={W - 2 * PAD} height={(bottom - roofY - 0.25) * S} fill={fill("concrete")} stroke="#a1a7ad" strokeWidth={0.6} />);
    const outsideTop = roofY - spec.outside[0].thickness;
    drawSide(spec.outside, "out", outsideTop);
    const ballast = spec.inside[0];
    drawSide([{ ...ballast, thickness: Math.max(1, H - 0.5) }], "in", roofY - Math.max(1, H - 0.5));
    bands.push(<rect key="mem" x={PAD} y={y(roofY)} width={W - 2 * PAD} height={0.25 * S} fill="#2b2f33" />);
    mark(PAD + (W - 2 * PAD) * 0.15, y(roofY + 0.12), "Waterproof layer");
    mark(PAD + (W - 2 * PAD) * 0.5, y(roofY + 1.2), "Concrete roof deck (new or existing)");
  } else {
    const outEnd = drawSide(spec.outside, "out", 0);
    const inEnd = drawSide(spec.inside, "in", 0);
    if (inEnd < bottom - 0.01) drawSide([{ label: "Subgrade", material: "soil", thickness: 0 }], "in", inEnd);
    if (outEnd < bottom - 0.01) drawSide([{ label: "Subgrade", material: "soil", thickness: 0 }], "out", outEnd);
  }

  // ---- the Permaloc product ----
  const alu = "#3d4650";
  const wallT = Math.max(0.17, product.family.includes("XL") ? 0.22 : 0.17) * S;
  const parts: React.ReactNode[] = [];
  const wx = xEdge - wallT / 2;
  parts.push(<rect key="wall" x={wx} y={y(wallTop)} width={wallT} height={(wallBottom - wallTop) * S} fill={alu} />);
  // exposed top lip
  parts.push(<rect key="lip" x={wx - 1.5} y={y(wallTop) - 1} width={wallT + 3} height={0.28 * S} rx={2} fill={alu} />);
  if (product.base > 0 && !isVertical) {
    parts.push(<rect key="flange" x={wx} y={y(wallBottom) - 0.14 * S} width={product.base * S} height={0.14 * S} fill={alu} />);
  }
  if (product.extender) {
    const seam = y(wallTop + product.extender);
    parts.push(<line key="seam" x1={wx - 3} x2={wx + wallT + 3} y1={seam} y2={seam} stroke="#fff" strokeWidth={1.4} />);
  }
  if (spec.geogrid) {
    const gy = y(wallBottom) + 1;
    parts.push(<path key="grid" d={`M${xEdge - 3.5 * S} ${gy} H${xEdge + IN_W * S - 8}`} stroke="#2f7d4f" strokeWidth={2} strokeDasharray="5 3" />);
    parts.push(<rect key="cap" x={xEdge} y={gy - 2} width={3 * S} height={3} fill="#1f5130" />);
    mark(xEdge - 2.5 * S, gy, "GeoGrid apron with capture plate");
  }
  // anchor
  if (anchor.type === "stake") {
    const sx = xEdge + wallT / 2 + 1;
    const y0 = y(wallTop + 0.6);
    const y1 = y(wallTop + 0.6 + anchor.length);
    parts.push(<path key="stake" d={`M${sx} ${y0} H${sx + 4} V${y1 - 8} L${sx + 2} ${y1} L${sx} ${y1 - 8} Z`} fill="#6b7480" stroke={alu} strokeWidth={0.6} />);
    mark(sx + 4, (y0 + y1) / 2, anchor.label);
  } else if (anchor.type === "spike") {
    const sx = xEdge + Math.min(product.base * 0.55, 1.6) * S;
    const y0 = y(wallBottom) - 0.35 * S;
    const y1 = y(wallBottom - 0.35 + anchor.length);
    parts.push(<rect key="head" x={sx - 4} y={y0 - 2} width={8} height={2.5} fill="#2b2f33" />);
    parts.push(<path key="spike" d={`M${sx - 2} ${y0} V${y1 - 7} L${sx} ${y1} L${sx + 2} ${y1 - 7} V${y0} Z`} fill="#2b2f33" />);
    const twist: string[] = [];
    for (let yy = y0 + 4; yy < y1 - 10; yy += 6) twist.push(`M${sx - 2} ${yy} l4 2.5`);
    parts.push(<path key="twist" d={twist.join(" ")} stroke="#9aa0a6" strokeWidth={0.8} />);
    mark(sx + 2, (y0 + y1) / 2, anchor.label);
  } else if (anchor.type === "pin") {
    const sx = xEdge + Math.min(product.base * 0.55, 1.6) * S;
    const y0 = y(wallBottom) - 0.35 * S;
    parts.push(<path key="pin" d={`M${sx - 3.5} ${y0 - 2} H${sx + 3.5} V${y0} H${sx + 1.2} V${y0 + 1 * S} L${sx} ${y0 + 1 * S + 4} L${sx - 1.2} ${y0 + 1 * S} V${y0} H${sx - 3.5} Z`} fill="#2b2f33" />);
    mark(sx + 2, y0 + 0.5 * S, anchor.label);
  }
  // product marker first in reading order
  markers.unshift({ n: 0, x: xEdge, y: y(wallTop) - 2, text: product.label });

  // ---- dimensions ----
  const dims: React.ReactNode[] = [];
  const dx = xEdge - 0.9 * S;
  dims.push(
    <g key="hdim" stroke="#1f5130" strokeWidth={0.9}>
      <line x1={dx} x2={dx} y1={y(wallTop)} y2={y(wallBottom)} />
      <line x1={dx - 3} x2={dx + 3} y1={y(wallTop)} y2={y(wallTop)} />
      <line x1={dx - 3} x2={dx + 3} y1={y(wallBottom)} y2={y(wallBottom)} />
    </g>,
  );
  dims.push(
    <text key="htxt" x={dx - 4} y={(y(wallTop) + y(wallBottom)) / 2 + 3} textAnchor="end" fontSize={10} fontWeight={700} fill="#1f5130" paintOrder="stroke" stroke="#fff" strokeWidth={3}>
      {fmt(H)}
    </text>,
  );
  if (isVertical || product.kind === "permastrip") {
    dims.push(
      <text key="half" x={xEdge + wallT + 6} y={y(wallTop) - 3} fontSize={9} fill="#1f5130" paintOrder="stroke" stroke="#fff" strokeWidth={3}>
        ½" max above surface
      </text>,
    );
  }

  // Renumber in reading order: product first, then top-down.
  // Identical labels (e.g. "Compacted grade" on both sides) share one number.
  const numbers = new Map<string, number>();
  const ordered = [markers[0], ...markers.slice(1).sort((a, b) => a.y - b.y || a.x - b.x)].map((m) => {
    if (!numbers.has(m.text)) numbers.set(m.text, numbers.size + 1);
    return { ...m, n: numbers.get(m.text)! };
  });
  const legend = [...numbers.keys()];

  return (
    <figure className="xsec">
      <figcaption className="xsec-title">
        <strong>{spec.title}</strong>
        <span>{spec.subtitle}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${Hpx}`} role="img" aria-label={`Cross-section: ${spec.title}, ${spec.subtitle}`} xmlns="http://www.w3.org/2000/svg">
        {defs}
        <rect width={W} height={Hpx} fill="#fff" />
        {bands}
        {parts}
        {dims}
        {ordered.map((m) => (
          <g key={`${m.n}-${m.x}-${m.y}`}>
            <circle cx={m.x} cy={m.y} r={7} fill="#1f5130" stroke="#fff" strokeWidth={1.5} />
            <text x={m.x} y={m.y + 3.2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
              {m.n}
            </text>
          </g>
        ))}
      </svg>
      <ol className="xsec-legend">
        {legend.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {spec.notes.length > 0 && (
        <ul className="xsec-notes">
          {spec.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </figure>
  );
}
