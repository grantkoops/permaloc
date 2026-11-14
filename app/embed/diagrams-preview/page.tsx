import { notFound } from "next/navigation";
import { walkDecisionTree } from "@/lib/decisionTree";
import type { DiagramSpec } from "@/lib/diagramTypes";
import CrossSection from "../CrossSection";

// Dev-only gallery of representative decision-tree paths. Enabled with DIAGRAM_PREVIEW=1.
export const dynamic = "force-dynamic";

const CASES: string[][] = [
  ["Landscape Bed", "Residential/Light Commercial Grade", "Curvilinear", "Turf and Mulch", '3.5" or Under'],
  ["Landscape Bed", "Commercial Grade", "Curvilinear", "Mulch and Stone", '6" or Under'],
  ["Landscape Bed", "Heavy Duty Commercial Grade", "Curvilinear", "Turf and Mulch", '6" or Under'],
  ["Landscape Bed", "Residential/Light Commercial Grade", "Straight", '4" or Under'],
  ["Maintenance Strip", "Heavy Duty Commercial Grade", '6" or Under'],
  ["Aggregate Walkway", "Residential/Light Commercial Grade", "Straight", "Compacted Aggregate", 'Base Extends 6-12"', '3"'],
  ["Brick Paver", "Residential/Light Commercial Grade", "Compacted Aggregate", '6cm paver (2-1/3")', '1" Leveling Course'],
  ["Brick Paver", "Heavy Duty Commercial Grade", "Concrete", "8cm", "Sand Setting Bed", '3/4" Leveling Course'],
  ["Brick Paver", "Residential/Light Commercial Grade", "Concrete", '6cm paver (2-1/3")', "Mastic/Mortar Setting Bed", '1/4" Leveling Course'],
  ["Permeable", "Residential/Light Commercial Grade", '7cm paver (2-3/4")', '1.5" setting stone (#8)'],
  ["Asphalt Surface", '4" Depth', "2 Lifts", "Restraining both lifts"],
  ["Sport Surface", '3" Depth'],
  ["Green Roof", '4.5"', "Built Up", "No, roof is flat"],
  ["Green Roof", '10.5"', "Modular", "No, roof is flat"],
];

export default function Preview() {
  if (process.env.DIAGRAM_PREVIEW !== "1") notFound();
  return (
    <main style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, padding: 16 }}>
      {CASES.map((answers) => {
        const r = walkDecisionTree(answers) as { status: string; diagram?: DiagramSpec; question?: string };
        return (
          <section key={answers.join("|")} style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 11, color: "#667", marginBottom: 6 }}>{answers.join(" › ")}</div>
            {r.diagram ? <CrossSection spec={r.diagram} /> : <em>{r.status} {r.question}</em>}
          </section>
        );
      })}
    </main>
  );
}
