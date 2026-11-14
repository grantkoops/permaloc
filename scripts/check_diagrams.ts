// Verifies every decision-tree path produces a usable diagram spec.
// Run: npx tsx scripts/check_diagrams.ts
import fs from "node:fs";
import { buildDiagramSpec } from "../lib/diagram";

type Node = { question?: string; options?: Record<string, Node>; result?: { recommendation: string; transfer_to_specialist: boolean } };
const { tree } = JSON.parse(fs.readFileSync("knowledge/decision-tree.json", "utf8")) as { tree: Node };

let ok = 0, skipped = 0;
const failures: string[] = [];
const byTitle = new Map<string, number>();
const walk = (n: Node, path: { question: string; answer: string }[]) => {
  if (n.result) {
    if (n.result.transfer_to_specialist) return void skipped++;
    const spec = buildDiagramSpec(path, n.result.recommendation);
    const why = !spec ? "no product parsed"
      : !(spec.product.height > 0 && spec.product.height < 18) ? `bad height ${spec.product.height}`
      : spec.inside.length === 0 ? "no layers"
      : spec.inside.some((l) => !(l.thickness >= 0) || l.thickness > 18) ? "bad layer thickness"
      : null;
    if (why) failures.push(`${why}: ${path.map((p) => p.answer).join(" > ")} => ${n.result.recommendation.split("\n").slice(0, 2).join(" ")}`);
    else { ok++; byTitle.set(spec!.product.family, (byTitle.get(spec!.product.family) ?? 0) + 1); }
    return;
  }
  for (const [a, c] of Object.entries(n.options ?? {})) walk(c, [...path, { question: n.question!, answer: a }]);
};
walk(tree, []);
console.log(`ok ${ok}, specialist ${skipped}, failed ${failures.length}`);
console.log(Object.fromEntries(byTitle));
failures.slice(0, 15).forEach((f) => console.log(" -", f));
process.exit(failures.length ? 1 : 0);
