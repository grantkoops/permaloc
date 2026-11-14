import fs from "node:fs";
import path from "node:path";
import { buildDiagramSpec, parseProduct } from "./diagram";

// Permaloc's product decision tree, generated from knowledge/source/decision-tree.xlsx
// by scripts/build_decision_tree.py.

type Result = {
  recommendation: string;
  url: string | null;
  reason_id: number | null;
  transfer_to_specialist: boolean;
};
type TreeNode = { question?: string; options?: Record<string, TreeNode>; result?: Result };
type TreeFile = { source: string; reasons: string[]; tree: TreeNode };

let cache: TreeFile | null = null;
function load(): TreeFile | null {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "knowledge", "decision-tree.json"), "utf8"));
  } catch {
    console.error("[decision-tree] knowledge/decision-tree.json missing or invalid");
    return null;
  }
  return cache;
}

export function applicationTypes(): string[] {
  return Object.keys(load()?.tree.options ?? {});
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();

/** Exact (normalized) match first, then a unique partial match, e.g. "8cm" -> '8cm paver (3-1/8")'. */
function matchOption(given: string, options: string[]): string | null {
  const g = norm(given);
  const exact = options.find((o) => norm(o) === g);
  if (exact) return exact;
  const partial = options.filter((o) => norm(o).includes(g) || g.includes(norm(o)));
  return partial.length === 1 ? partial[0] : null;
}

export function walkDecisionTree(answers: string[]) {
  const data = load();
  if (!data) return { status: "unavailable", note: "Decision tree not loaded. Suggest contacting a Permaloc product specialist." };

  let node = data.tree;
  const path: { question: string; answer: string }[] = [];
  for (let i = 0; i <= answers.length; i++) {
    if (node.result) {
      const r = node.result;
      if (r.transfer_to_specialist) {
        return {
          status: "transfer_to_specialist",
          path,
          note: "Permaloc wants a product specialist to handle this configuration. Offer to pass the visitor's details to the team (submit_lead, request_type spec_help) and give the phone number 1-800-356-9660.",
        };
      }
      return {
        status: "recommendation",
        path,
        recommendation: r.recommendation,
        product_url: r.url,
        product_description: r.reason_id != null ? data.reasons[r.reason_id] : undefined,
        diagram: buildDiagramSpec(path, r.recommendation) ?? undefined,
        ...(i < answers.length ? { note: `Ignored extra answers: ${answers.slice(i).join(", ")}` } : {}),
      };
    }
    const question = node.question!;
    const options = Object.keys(node.options ?? {});
    if (i === answers.length) {
      return { status: "need_answer", step: i + 1, question, options, path };
    }
    const chosen = matchOption(answers[i], options);
    if (!chosen) {
      return {
        status: "invalid_answer",
        step: i + 1,
        question,
        given: answers[i],
        options,
        path,
        note:
          "The answer doesn't match an option. Map the visitor's words to one option, or ask them to choose. " +
          "If their project is outside every option (e.g. deeper than the largest size listed), don't stretch the tree: offer a Permaloc product specialist instead.",
      };
    }
    path.push({ question, answer: chosen });
    node = node.options![chosen];
  }
  return { status: "error" };
}

/** First tree path (optionally within one application) whose recommended product is `family`. */
export function findExamplePath(family: string, application?: string, height?: number) {
  const data = load();
  if (!data) return null;
  const fam = family.toLowerCase();
  let best: { answers: string[]; score: number } | null = null;
  const visit = (node: TreeNode, answers: string[]) => {
    if (node.result) {
      const first = node.result.recommendation.split("\n").map((l) => l.trim()).find((l) => l && !/^recommend(ed)?:?$/i.test(l)) ?? "";
      const lower = first.toLowerCase();
      // "CleanLine" must not match "CleanLine XL"
      if (!lower.includes(fam) || (fam === "cleanline" && lower.includes("cleanline xl"))) return;
      if (application && answers[0]?.toLowerCase() !== application.toLowerCase()) return;
      const score = height ? -Math.abs((parseProduct(node.result.recommendation)?.height ?? 0) - height) : 0;
      if (!best || score > best.score) best = { answers, score };
      return;
    }
    for (const [ans, child] of Object.entries(node.options ?? {})) visit(child, [...answers, ans]);
  };
  visit(data.tree, []);
  return best ? (best as { answers: string[] }).answers : null;
}
