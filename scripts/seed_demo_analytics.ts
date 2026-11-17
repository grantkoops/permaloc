// Fills chat_sessions with made-up sessions so the dashboard can be previewed before real traffic.
// Every demo row's id starts with "demo-".
//   DATABASE_URL=... npx tsx scripts/seed_demo_analytics.ts          add ~3,000 demo sessions
//   DATABASE_URL=... npx tsx scripts/seed_demo_analytics.ts --clear  remove them again
import postgres from "postgres";
import { SCHEMA_SQL } from "../lib/analytics";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
function pick<T>(items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[0][0];
}

const PLACES: [[string, string, string], number][] = [
  [["US", "MI", "Grand Rapids"], 14], [["US", "MI", "Detroit"], 8], [["US", "OH", "Columbus"], 7], [["US", "IL", "Chicago"], 9],
  [["US", "TX", "Dallas"], 7], [["US", "TX", "Houston"], 5], [["US", "CA", "San Diego"], 6], [["US", "CA", "Los Angeles"], 5],
  [["US", "FL", "Orlando"], 6], [["US", "NY", "Buffalo"], 4], [["US", "PA", "Pittsburgh"], 4], [["US", "WI", "Milwaukee"], 4],
  [["US", "MN", "Minneapolis"], 4], [["US", "CO", "Denver"], 4], [["US", "GA", "Atlanta"], 4], [["US", "NC", "Charlotte"], 3],
  [["US", "WA", "Seattle"], 3], [["US", "IN", "Indianapolis"], 3], [["US", "AZ", "Phoenix"], 3], [["CA", "ON", "Toronto"], 5],
  [["CA", "BC", "Vancouver"], 2], [["CA", "AB", "Calgary"], 1], [["GB", "ENG", "London"], 1], [["AU", "NSW", "Sydney"], 1], [["MX", "NLE", "Monterrey"], 0.5],
];
const PRODUCTS: [string, number][] = [
  ["CleanLine", 30], ["ProLine", 18], ["StructurEdge", 16], ["PermaStrip", 12], ["CleanLine XL", 10], ["BrickBlock", 7],
  ["AsphaltEdge", 7], ["GeoEdge", 5], ["ProSlide", 5], ["AthletEdge", 3],
];
const RECS: Record<string, string> = {
  CleanLine: 'CleanLine 3/16" x 4"', ProLine: 'ProLine 1/8" x 4"', StructurEdge: '1/8" x 1-5/8" StructurEdge', PermaStrip: 'PermaStrip 1/8" x 4"',
  "CleanLine XL": 'CleanLine XL 6"', BrickBlock: '.065" x 2.75" BrickBlock', AsphaltEdge: 'AsphaltEdge 2"', GeoEdge: 'GeoEdge 3"', ProSlide: 'ProSlide 1/8" x 4"', AthletEdge: 'AthletEdge 2"',
};
const APPS: Record<string, string> = {
  CleanLine: "Landscape bed", ProLine: "Landscape bed", StructurEdge: "Paver", PermaStrip: "Landscape bed", "CleanLine XL": "Gravel / aggregate",
  BrickBlock: "Paver", AsphaltEdge: "Asphalt", GeoEdge: "Gravel / aggregate", ProSlide: "Landscape bed", AthletEdge: "Athletic field",
};
const CONCLUSIONS: [string, number][] = [
  ["product_recommended", 26], ["question_answered", 24], ["lead_submitted", 9], ["found_dealer_or_rep", 11], ["quantity_estimate", 8],
  ["referred_to_specialist", 3], ["unresolved", 6], ["abandoned", 11], ["off_topic", 2],
];
const TOPICS: Record<string, string[]> = {
  product_recommended: ["product_selection", "specs"], question_answered: ["specs", "installation"], lead_submitted: ["pricing_quote", "samples"],
  found_dealer_or_rep: ["where_to_buy"], quantity_estimate: ["quantities"], referred_to_specialist: ["product_selection"], unresolved: ["other", "pricing_quote"],
  abandoned: ["other"], off_topic: ["other"],
};
const CUSTOMERS: [string, number][] = [["contractor", 38], ["homeowner", 30], ["landscape_architect", 12], ["distributor", 6], ["unknown", 14]];
const PAGES: [string, number][] = [
  ["https://www.permaloc.com/", 30], ["https://www.permaloc.com/products/cleanline/", 14], ["https://www.permaloc.com/where-to-buy/", 12],
  ["https://www.permaloc.com/products/structuredge/", 8], ["https://www.permaloc.com/cad-by-application/", 7], ["https://www.permaloc.com/contact/", 6],
];

function summaryFor(c: string, product: string | null, city: string) {
  const p = product ?? "edging";
  switch (c) {
    case "lead_submitted": return `Asked for a quote on ${p} for a project near ${city}; details sent to sales.`;
    case "product_recommended": return `Walked through the product guide and was recommended ${p}.`;
    case "found_dealer_or_rep": return `Looked for a dealer near ${city} and got the local buying options.`;
    case "quantity_estimate": return `Estimated how many pieces and stakes of ${p} a project needs.`;
    case "referred_to_specialist": return `Unusual configuration; referred to a Permaloc product specialist.`;
    case "question_answered": return `Asked about ${p} specs and installation; question answered.`;
    case "unresolved": return `Asked for pricing the assistant couldn't provide and left without a next step.`;
    case "abandoned": return `Opened the chat and left after one message.`;
    default: return `Asked about something unrelated to Permaloc.`;
  }
}

async function main() {
  await sql.unsafe(SCHEMA_SQL);
  if (process.argv.includes("--clear")) {
    const r = await sql`delete from chat_sessions where id like 'demo-%'`;
    console.log(`Removed ${r.count} demo sessions.`);
    return sql.end();
  }

  const now = Date.now();
  const rows: Record<string, unknown>[] = [];
  const visitors: string[] = [];
  for (let day = 400; day >= 0; day--) {
    const growth = 0.5 + (400 - day) / 400; // traffic grows over time
    const season = 1 + 0.6 * Math.sin(((now - day * 86400_000) / (365 * 86400_000)) * 2 * Math.PI - 1.2); // spring/summer peak
    const dow = new Date(now - day * 86400_000).getDay();
    const weekday = dow === 0 || dow === 6 ? 0.55 : 1;
    const count = Math.round(9 * growth * season * weekday * (0.7 + rand() * 0.6));
    for (let i = 0; i < count; i++) {
      const started = new Date(now - day * 86400_000 - rand() * 86400_000 * (day === 0 ? 0.9 : 1));
      const [country, region, city] = pick(PLACES);
      const conclusion = pick(CONCLUSIONS);
      const product = conclusion === "abandoned" || conclusion === "off_topic" ? null : pick(PRODUCTS);
      const products = product ? [...new Set([product, ...(rand() < 0.25 ? [pick(PRODUCTS)] : [])])] : [];
      const recommended = conclusion === "product_recommended" || (conclusion === "lead_submitted" && rand() < 0.6) ? RECS[product!] : null;
      const msgs = conclusion === "abandoned" ? 1 : 2 + Math.floor(rand() * 7);
      let visitor: string;
      if (visitors.length && rand() < 0.18) visitor = visitors[Math.floor(rand() * visitors.length)];
      else visitors.push((visitor = `demo-v${visitors.length}`));
      const customer = pick(CUSTOMERS);
      rows.push({
        id: `demo-${rows.length}`,
        visitor_id: visitor,
        started_at: started,
        last_message_at: new Date(started.getTime() + msgs * (40 + rand() * 120) * 1000),
        user_messages: msgs,
        country,
        region,
        city,
        page_url: pick(PAGES),
        application: product && rand() < 0.7 ? APPS[product] : null,
        recommended_product: recommended,
        products,
        tools_used: recommended ? ["recommend_product"] : conclusion === "quantity_estimate" ? ["calculate_materials"] : [],
        lead_submitted: conclusion === "lead_submitted",
        lead_request_type: conclusion === "lead_submitted" ? pick([["quote", 6], ["samples", 3], ["rep_contact", 2], ["spec_help", 1]] as [string, number][]) : null,
        lead_customer_type: conclusion === "lead_submitted" && customer !== "unknown" ? customer : null,
        transferred_to_specialist: conclusion === "referred_to_specialist",
        rep_lookup_region: conclusion === "found_dealer_or_rep" ? region : null,
        outcome: conclusion,
        conclusion,
        topics: TOPICS[conclusion].slice(0, 1 + Math.floor(rand() * 2)),
        customer_type: customer,
        sentiment: conclusion === "unresolved" ? "negative" : pick([["positive", 5], ["neutral", 4], ["negative", 0.5]] as [string, number][]),
        summary: summaryFor(conclusion, recommended ?? product, city),
        classified_at: started,
        transcript: sql.json([
          { role: "user", content: `(demo) Question about ${product ?? "Permaloc"}` },
          { role: "assistant", content: `(demo) ${summaryFor(conclusion, recommended ?? product, city)}` },
        ]),
      });
    }
  }
  await sql`delete from chat_sessions where id like 'demo-%'`;
  for (let i = 0; i < rows.length; i += 500) await sql`insert into chat_sessions ${sql(rows.slice(i, i + 500))}`;
  console.log(`Inserted ${rows.length} demo sessions from ${visitors.length} demo visitors.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
