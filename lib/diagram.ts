import type { DiagramSpec, EdgeKind, Layer } from "./diagramTypes";

// Builds an illustrative cross-section from a decision-tree path and its recommendation.
// Conventions follow Permaloc's CAD details (permaloc.com/cad-by-application/):
// - straight edging: top max 1/2" above the surface, 12" stakes (18" for CleanLine XL) locked into loops
// - L-shaped restraints: base flange under the setting course, 3/8" x 10" spiral spikes at 12" o.c.
//   (4" o.c. alternate), compacted base extending 6" beyond; on concrete, Ramset/Hilti pins
//   2.5" min. from the slab edge, voids under the restraint filled
// - GeoEdge sits on the waterproofing over the roof deck with no penetrations

type Step = { question: string; answer: string };

const FAMILIES: { name: string; kind: EdgeKind }[] = [
  { name: "CleanLine XL", kind: "vertical" },
  { name: "CleanLine", kind: "vertical" },
  { name: "ProSlide LT", kind: "vertical" },
  { name: "ProSlide", kind: "vertical" },
  { name: "ProLine", kind: "vertical" },
  { name: "PermaStrip", kind: "permastrip" },
  { name: "StructurEdge", kind: "restraint" },
  { name: "BrickBlock", kind: "restraint" },
  { name: "AsphaltEdge", kind: "restraint" },
  { name: "AthletEdge", kind: "restraint" },
  { name: "GeoEdge", kind: "geoedge" },
];

/** '1-5/8' -> 1.625, '3/16' -> 0.1875, '.065' -> 0.065, '5.5' -> 5.5 */
export function parseInches(s: string): number {
  const t = s.trim();
  let m = t.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return +m[1] / +m[2];
  return parseFloat(t);
}

const firstNumber = (s: string | undefined, fallback: number) => {
  const m = s?.match(/(\d+-\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*"/);
  return m ? parseInches(m[1]) : fallback;
};

export function parseProduct(recommendation: string, hintFamily?: string) {
  const lines = recommendation
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^recommend(ed)?:?$/i.test(l));
  // When a leaf offers two choices ("... or ..."), illustrate the first.
  const line = (lines[0] ?? "").split(/\s+or\s+/i)[0];
  const fam =
    FAMILIES.find((f) => line.toLowerCase().includes(f.name.toLowerCase())) ??
    (hintFamily ? FAMILIES.find((f) => f.name === hintFamily) : undefined);
  if (!fam) return null;
  const extender = /extender/i.test(line) ? 4 : 0;
  const sizes = [...line.split(/\s+with\s+/i)[0].matchAll(/(\d+-\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*"/g)].map((m) => ({ raw: m[1], v: parseInches(m[1]) }));
  let height = 4;
  let base = 0;
  let sizeLabel = "";
  switch (fam.name) {
    case "AsphaltEdge":
    case "AthletEdge":
    case "GeoEdge": // "height x base", or a single height
      height = sizes[0]?.v ?? 2;
      base = sizes[1]?.v ?? (fam.name === "GeoEdge" ? 3.25 : height >= 3 ? 3 : 2.25);
      sizeLabel = `${sizes[0]?.raw ?? height}" x ${sizes[1]?.raw ?? base}"`;
      break;
    case "StructurEdge":
    case "BrickBlock": // "thickness x height"
      height = sizes.length > 1 ? sizes[1].v : sizes[0]?.v ?? 1.75;
      base = fam.name === "StructurEdge" ? 2.5 : 2.25;
      sizeLabel = sizes.map((s) => `${s.raw}"`).join(" x ");
      break;
    case "CleanLine XL":
      height = sizes[0]?.v ?? 5;
      sizeLabel = `${sizes[0]?.raw ?? height}"`;
      break;
    default: // "thickness x height"
      height = sizes.length > 1 ? sizes[1].v : sizes[0]?.v ?? 4;
      base = fam.name === "PermaStrip" ? 2 : 0;
      sizeLabel = sizes.map((s) => `${s.raw}"`).join(" x ");
  }
  return {
    family: fam.name,
    kind: fam.kind,
    height: height + extender,
    base,
    extender,
    title: `${fam.name} ${sizeLabel}${extender ? ' + 4" EX4 extender' : ""}`.trim(),
  };
}

function answerFor(path: Step[], re: RegExp) {
  return path.find((s) => re.test(s.question))?.answer;
}

const PAVER_CM: Record<string, number> = { "6cm": 2.36, "7cm": 2.75, "8cm": 3.125, "10cm": 3.94, "12cm": 4.72 };
const paverThickness = (a?: string) => {
  const k = a?.match(/(\d+)cm/)?.[0];
  return (k && PAVER_CM[k]) || 2.36;
};

function bedLayer(word: string, depth: number): Layer {
  if (/stone/i.test(word)) return { label: "Stone / aggregate", material: "stone", thickness: depth };
  if (/mulch/i.test(word)) return { label: "Mulch / bed media", material: "mulch", thickness: depth };
  return { label: "Turf", material: "turf", thickness: 1.5 };
}

export function buildDiagramSpec(path: Step[], recommendation: string): DiagramSpec | null {
  const app = path[0]?.answer ?? "";
  const product = parseProduct(recommendation, app === "Green Roof" ? "GeoEdge" : undefined);
  if (!product) return null;
  const notes: string[] = [];
  let inside: Layer[] = [];
  let outside: Layer[] = [{ label: "Turf", material: "turf", thickness: 1.5 }];
  let anchor: DiagramSpec["anchor"] = { type: "stake", length: 12, label: '12" aluminum stake locked into edging loops' };
  let geogrid = false;
  let subtitle = app;

  const leafNotes = recommendation.toLowerCase();
  const onConcrete = /concrete/i.test(answerFor(path, /sub base/i) ?? "") || leafNotes.includes("anchor to concrete");

  if (product.kind === "vertical" || product.kind === "permastrip") {
    if (product.family === "CleanLine XL") anchor = { type: "stake", length: 18, label: '18" aluminum stake locked into XLR adaptor' };
    const depthAns = answerFor(path, /deep are you wanting to retain|depth of the aggregate/i);
    const depth = depthAns ? (/over 6/i.test(depthAns) ? 8 : firstNumber(depthAns, 3)) : Math.max(2, product.height - 1.5);
    const materials = answerFor(path, /turf, mulch, stone/i);
    if (app === "Aggregate Walkway") {
      inside = [{ label: "Surface aggregate", material: "aggregate", thickness: depth }];
      const base = answerFor(path, /base course compacted aggregate or native soil/i);
      if (/compacted/i.test(base ?? "")) inside.push({ label: "Compacted aggregate base", material: "base", thickness: 4 });
      subtitle = "Aggregate walkway";
    } else if (materials) {
      const [a, b] = materials.split(/\s+and\s+/i);
      outside = [bedLayer(a, depth)];
      inside = [bedLayer(b ?? a, depth)];
      subtitle = `Landscape bed: ${materials.toLowerCase()}`;
    } else {
      inside = [{ label: app === "Maintenance Strip" ? "Stone or mulch" : "Bed media", material: app === "Maintenance Strip" ? "stone" : "mulch", thickness: depth }];
      subtitle = app === "Maintenance Strip" ? "Maintenance strip" : app;
    }
    inside.push({ label: "Compacted grade", material: "soil", thickness: 0 });
    if (outside[0].material === "turf") outside.push({ label: "Compacted grade", material: "soil", thickness: 0 });
    notes.push("Top of edging max. 1/2\" above the surface material. Compact grades on both sides to avoid settling.");
    if (product.kind === "permastrip") notes.push("Horizontal base runs under the stone or mulch for extra rigidity. Use 8' lengths for curves.");
    notes.push(product.family === "CleanLine XL" ? "8' sections include 3 stakes and 3 XLR adaptors." : "8' sections include 3 stakes; 16' sections include 5.");
  } else if (product.kind === "restraint" && (app === "Brick Paver" || app === "Permeable")) {
    const paverAns = answerFor(path, /thick are your pavers/i);
    const level = answerFor(path, /leveling course|setting bed|setting stone/i);
    const levelCourse = answerFor(path, /^leveling course measurement/i);
    const t = paverThickness(paverAns);
    inside = [{ label: `Paver (${paverAns?.split(" ")[0] ?? "6cm"})`, material: "paver", thickness: t }];
    if (app === "Permeable") {
      const setting = answerFor(path, /setting stone/i);
      inside.push({ label: `${firstNumber(setting, 1.5)}" #8 setting stone`, material: "setting", thickness: firstNumber(setting, 1.5) });
      inside.push({ label: "#57 open-graded base", material: "openbase", thickness: 6 });
      geogrid = true;
      subtitle = "Permeable pavers";
      anchor = { type: "spike", length: 10, label: '3/8" x 10" spiral steel spike, 12" o.c.' };
      notes.push("Use GeoGrid and capture plates to anchor the restraint between the #57 base and the #8 setting stone.");
    } else if (onConcrete) {
      const bed = /mastic|mortar/i.test(level ?? "") ? "Mastic / mortar setting bed" : /bituminous/i.test(level ?? "") ? "Bituminous setting bed" : "Sand setting bed";
      const lc = firstNumber(levelCourse, 0.5);
      inside.push({ label: `${levelCourse?.replace(/ leveling course/i, "") ?? lc + '"'} ${bed.toLowerCase()}`, material: "setting", thickness: Math.max(lc, 0.375) });
      inside.push({ label: "Concrete slab", material: "concrete", thickness: 4 });
      anchor = { type: "pin", length: 1, label: 'Ramset / Hilti pin or TapCon, 12" o.c., 2.5" min. from slab edge' };
      subtitle = "Brick paver on concrete";
      notes.push("Anchor to concrete with Hilti pins, Ramset or TapCons. Fill all voids under the restraint.");
    } else {
      const lc = firstNumber(level, 1);
      inside.push({ label: `${level?.match(/^[\d/.]+"/)?.[0] ?? lc + '"'} sand setting course`, material: "sand", thickness: lc });
      inside.push({ label: "Compacted aggregate base", material: "base", thickness: 6 });
      anchor = { type: "spike", length: 10, label: '3/8" x 10" spiral steel spike, 12" o.c. (4" o.c. min.)' };
      subtitle = "Brick paver on compacted aggregate";
      notes.push('Extend the compacted base course 6" beyond the restraint.');
    }
    outside = [
      { label: "Turf", material: "turf", thickness: 1.5 },
      { label: "Compacted grade adjacent to restraint", material: "soil", thickness: 0 },
    ];
  } else if (product.kind === "restraint") {
    // Asphalt, sport surfaces and aggregate walkways with an extended base
    const depthAns = answerFor(path, /depth of the asphalt|depth you are looking to retain|depth of the aggregate/i);
    const depth = firstNumber(depthAns, product.height);
    if (app === "Asphalt Surface") {
      const lifts = /2/.test(answerFor(path, /lifts\?/i) ?? "1");
      if (lifts) {
        inside = [
          { label: "Finish course asphalt", material: "asphalt", thickness: Math.min(1.5, depth / 2) },
          { label: "Base course asphalt", material: "asphalt", thickness: depth - Math.min(1.5, depth / 2) },
        ];
      } else inside = [{ label: "Single course asphalt", material: "asphalt", thickness: depth }];
      subtitle = `Asphalt surface, ${lifts ? "2 lifts" : "1 lift"}`;
      notes.push("Leave 3/8\" between sections for expansion. Fill all voids under the restraint.");
    } else if (app === "Sport Surface") {
      inside = [
        { label: "Rubberized top course", material: "rubber", thickness: Math.min(1, depth / 2) },
        { label: "Asphalt base course", material: "asphalt", thickness: Math.max(depth - 1, depth / 2) },
      ];
      subtitle = "Sport / play surface";
    } else {
      inside = [{ label: "Surface aggregate", material: "aggregate", thickness: depth }];
      subtitle = "Aggregate walkway";
    }
    inside.push({ label: 'Compacted base, 6" beyond restraint', material: "base", thickness: 5 });
    outside = [
      { label: "Turf", material: "turf", thickness: 1.5 },
      { label: "Compacted grade adjacent to restraint", material: "soil", thickness: 0 },
    ];
    anchor = { type: "spike", length: 10, label: '3/8" x 10" spiral steel spike, 12" o.c.' };
  } else if (product.kind === "geoedge") {
    const depth = firstNumber(answerFor(path, /growing media/i), product.height);
    const modular = /modular/i.test(answerFor(path, /modular tray/i) ?? "");
    outside = [{ label: modular ? "Green roof module" : `${depth}" growing media`, material: modular ? "tray" : "growing", thickness: depth }];
    inside = [{ label: "Paver or aggregate ballast", material: "aggregate", thickness: product.height }];
    anchor = { type: "none", length: 0, label: "" };
    subtitle = modular ? "Green roof, modular trays" : "Green roof, built up";
    notes.push("Sits on the waterproofing over the roof deck; no penetrations. Sections join with two 2.75\" sliding connectors.");
    if (product.extender) notes.push('The EX4 extender adds 4" of height for deeper growing media.');
  }

  // Carry the decision tree's own special notes through.
  if (leafNotes.includes("geogrid") && !notes.some((n) => n.includes("GeoGrid"))) notes.push("Use GeoGrid and capture plates as noted.");

  return {
    title: product.title,
    subtitle,
    product: {
      family: product.family,
      kind: product.kind,
      height: product.height,
      base: product.base,
      extender: product.extender,
      label: `Permaloc ${product.title}`,
    },
    anchor,
    inside,
    outside,
    geogrid,
    notes,
  };
}
