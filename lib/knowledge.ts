import fs from "node:fs";
import path from "node:path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

export type MaterialSpec = {
  id: string;
  name: string;
  piece_length_ft?: number[];
  /** stakes per piece, keyed by piece length in feet, e.g. {"8": 3, "16": 5} */
  stakes_per_piece?: Record<string, number>;
  stake_length_in?: number;
  stake_spacing_in?: number;
  note?: string;
  heights_in?: number[];
  source_url?: string;
};

export type SalesRep = {
  name: string;
  territory: string;
  states: string[]; // two-letter codes
  phone?: string;
  email?: string;
  notes?: string;
};

function readOptional(file: string): string | null {
  try {
    return fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8");
  } catch {
    return null;
  }
}

function readJson<T>(file: string, fallback: T): T {
  const raw = readOptional(file);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`[knowledge] could not parse ${file}`);
    return fallback;
  }
}

// Read once per server instance. The text is stable, so the system prompt stays cacheable.
let cache: { text: string; materials: MaterialSpec[]; reps: SalesRep[] } | null = null;

export function loadKnowledge() {
  if (cache) return cache;
  const mdFiles = fs.existsSync(KNOWLEDGE_DIR)
    ? fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".md")).sort()
    : [];
  const text = mdFiles.map((f) => readOptional(f) ?? "").join("\n\n---\n\n");
  const materials = readJson<MaterialSpec[]>("materials.json", []);
  const reps = readJson<SalesRep[]>("reps.json", []);
  cache = { text, materials, reps };
  return cache;
}
