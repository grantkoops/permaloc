import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import postgres from "postgres";
import { z } from "zod";

// Session analytics for the reporting dashboard (see dashboard/).
// Every chat turn upserts one row per conversation into chat_sessions. Nothing is
// recorded unless DATABASE_URL is set, and a database failure never breaks the chat.

export const PRODUCT_LINES = [
  "CleanLine XL",
  "CleanLine",
  "ProLine",
  "ProSlide",
  "PermaStrip",
  "StructurEdge",
  "BrickBlock",
  "AsphaltEdge",
  "AthletEdge",
  "GeoEdge",
  "GeoTerrace",
  "ResinStop",
  "StraightEdge",
  "BedFlex",
] as const;

export const CONCLUSIONS = [
  "lead_submitted",
  "product_recommended",
  "referred_to_specialist",
  "found_dealer_or_rep",
  "quantity_estimate",
  "question_answered",
  "unresolved",
  "abandoned",
  "off_topic",
] as const;

export const TOPICS = [
  "product_selection",
  "specs",
  "installation",
  "quantities",
  "pricing_quote",
  "where_to_buy",
  "samples",
  "company_info",
  "other",
] as const;

export const SCHEMA_SQL = `
create table if not exists chat_sessions (
  id                text primary key,
  visitor_id        text,
  started_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now(),
  user_messages     integer not null default 0,
  country           text,
  region            text,
  city              text,
  page_url          text,
  application       text,
  recommended_product text,
  products          text[] not null default '{}',
  tools_used        text[] not null default '{}',
  lead_submitted    boolean not null default false,
  lead_request_type text,
  lead_customer_type text,
  transferred_to_specialist boolean not null default false,
  rep_lookup_region text,
  outcome           text,
  conclusion        text,
  topics            text[] not null default '{}',
  customer_type     text,
  sentiment         text,
  summary           text,
  classified_at     timestamptz,
  transcript        jsonb
);
create index if not exists chat_sessions_started_at_idx on chat_sessions (started_at desc);
create index if not exists chat_sessions_visitor_idx on chat_sessions (visitor_id);
`;

type Sql = ReturnType<typeof postgres>;
let sql: Sql | null = null;
let schemaReady: Promise<unknown> | null = null;

function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!sql) {
    // prepare:false keeps it compatible with transaction-mode poolers (Neon, Supabase, PgBouncer).
    sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20, onnotice: () => {} });
  }
  schemaReady ??= sql.unsafe(SCHEMA_SQL).catch((e) => {
    schemaReady = null;
    throw e;
  });
  return sql;
}

/** What the chat route learned during one turn. */
export type TurnSignals = {
  application?: string;
  recommendedProduct?: string;
  products: Set<string>;
  tools: Set<string>;
  lead?: { request_type?: string; customer_type?: string };
  transferred: boolean;
  repRegion?: string;
  assistantText: string;
};

export function newTurnSignals(): TurnSignals {
  return { products: new Set(), tools: new Set(), transferred: false, assistantText: "" };
}

/** Pull analytics signals out of one tool call and its result. */
export function noteToolCall(s: TurnSignals, name: string, input: unknown, resultJson: string, isError: boolean) {
  s.tools.add(name);
  if (isError) return;
  const inp = (input ?? {}) as Record<string, unknown>;
  let res: Record<string, unknown> = {};
  try {
    res = JSON.parse(resultJson);
  } catch {}
  if (name === "recommend_product") {
    const answers = Array.isArray(inp.answers) ? (inp.answers as string[]) : [];
    if (answers[0]) s.application = answers[0];
    if (res.status === "recommendation" && typeof res.recommendation === "string") {
      s.recommendedProduct = primaryLine(res.recommendation);
      productsIn(res.recommendation.split("\n").slice(0, 2).join(" ")).forEach((p) => s.products.add(p));
    }
    if (res.status === "transfer_to_specialist") s.transferred = true;
  } else if (name === "show_installation_diagram" && typeof inp.product === "string") {
    s.products.add(inp.product);
  } else if (name === "calculate_materials" && typeof res.product === "string") {
    productsIn(res.product).forEach((p) => s.products.add(p));
  } else if (name === "find_sales_contact" && typeof inp.region === "string") {
    s.repRegion = inp.region.trim().toUpperCase().slice(0, 10);
  } else if (name === "submit_lead") {
    s.lead = { request_type: str(inp.request_type), customer_type: str(inp.customer_type) };
    if (typeof inp.products_of_interest === "string") productsIn(inp.products_of_interest).forEach((p) => s.products.add(p));
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 60) : undefined);

function primaryLine(rec: string) {
  const line = rec
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^recommend(ed)?:?$/i.test(l));
  return (line ?? rec).slice(0, 120);
}

/** Product line names mentioned in free text ("CleanLine XL" wins over "CleanLine"). */
export function productsIn(text: string): string[] {
  const found: string[] = [];
  let rest = text;
  for (const p of PRODUCT_LINES) {
    const re = new RegExp(`\\b${p.replace(/ /g, "\\s+")}\\b`, "gi");
    if (re.test(rest)) {
      found.push(p);
      rest = rest.replace(re, " ");
    }
  }
  return found;
}

/** Simple rules-based outcome, always available even when the AI classifier is off. */
function ruleOutcome(row: { lead_submitted: boolean; transferred_to_specialist: boolean; recommended_product: string | null; rep_lookup_region: string | null; tools_used: string[]; user_messages: number }) {
  if (row.lead_submitted) return "lead_submitted";
  if (row.transferred_to_specialist) return "referred_to_specialist";
  if (row.recommended_product) return "product_recommended";
  if (row.rep_lookup_region) return "found_dealer_or_rep";
  if (row.tools_used.includes("calculate_materials")) return "quantity_estimate";
  if (row.user_messages <= 1) return "abandoned";
  return "question_answered";
}

export type RecordInput = {
  sessionId: string;
  visitorId?: string;
  pageUrl?: string;
  headers: Headers;
  messages: { role: string; content: string }[]; // the visitor's history, as sent
  signals: TurnSignals;
};

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const validId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

/** Upsert the session row after a turn, then (optionally) classify the conversation. */
export async function recordTurn(input: RecordInput) {
  const sql = db();
  if (!sql || !validId(input.sessionId)) return;
  try {
    await schemaReady;
    const h = input.headers;
    // Vercel adds these geolocation headers on every request; elsewhere they're absent.
    const country = h.get("x-vercel-ip-country") || null;
    const region = h.get("x-vercel-ip-country-region") || null;
    const city = decodeHeader(h.get("x-vercel-ip-city"));
    const s = input.signals;

    const userMessages = input.messages.filter((m) => m.role === "user").length;
    const transcript = storeTranscripts()
      ? [...input.messages.map((m) => ({ role: m.role, content: m.content })), ...(s.assistantText ? [{ role: "assistant", content: s.assistantText }] : [])]
      : null;
    const mentioned = productsIn(input.messages.map((m) => m.content).join("\n") + "\n" + s.assistantText);
    const products = [...new Set([...s.products, ...mentioned])];

    const [row] = await sql<
      { lead_submitted: boolean; transferred_to_specialist: boolean; recommended_product: string | null; rep_lookup_region: string | null; tools_used: string[]; user_messages: number }[]
    >`
      insert into chat_sessions (id, visitor_id, user_messages, country, region, city, page_url, application, recommended_product,
        products, tools_used, lead_submitted, lead_request_type, lead_customer_type, transferred_to_specialist, rep_lookup_region, transcript)
      values (${input.sessionId}, ${validId(input.visitorId) ? input.visitorId : null}, ${userMessages}, ${country}, ${region}, ${city},
        ${cleanUrl(input.pageUrl)}, ${s.application ?? null}, ${s.recommendedProduct ?? null}, ${products}, ${[...s.tools]},
        ${!!s.lead}, ${s.lead?.request_type ?? null}, ${s.lead?.customer_type ?? null}, ${s.transferred}, ${s.repRegion ?? null},
        ${transcript ? sql.json(transcript) : null})
      on conflict (id) do update set
        last_message_at = now(),
        user_messages = greatest(chat_sessions.user_messages, excluded.user_messages),
        country = coalesce(chat_sessions.country, excluded.country),
        region = coalesce(chat_sessions.region, excluded.region),
        city = coalesce(chat_sessions.city, excluded.city),
        page_url = coalesce(chat_sessions.page_url, excluded.page_url),
        visitor_id = coalesce(chat_sessions.visitor_id, excluded.visitor_id),
        application = coalesce(excluded.application, chat_sessions.application),
        recommended_product = coalesce(excluded.recommended_product, chat_sessions.recommended_product),
        products = array(select distinct unnest(chat_sessions.products || excluded.products)),
        tools_used = array(select distinct unnest(chat_sessions.tools_used || excluded.tools_used)),
        lead_submitted = chat_sessions.lead_submitted or excluded.lead_submitted,
        lead_request_type = coalesce(excluded.lead_request_type, chat_sessions.lead_request_type),
        lead_customer_type = coalesce(excluded.lead_customer_type, chat_sessions.lead_customer_type),
        transferred_to_specialist = chat_sessions.transferred_to_specialist or excluded.transferred_to_specialist,
        rep_lookup_region = coalesce(excluded.rep_lookup_region, chat_sessions.rep_lookup_region),
        transcript = coalesce(excluded.transcript, chat_sessions.transcript)
      returning lead_submitted, transferred_to_specialist, recommended_product, rep_lookup_region, tools_used, user_messages`;

    await sql`update chat_sessions set outcome = ${ruleOutcome(row)} where id = ${input.sessionId}`;

    if (process.env.ANALYTICS_CLASSIFY !== "off") {
      const convo = [...input.messages, ...(s.assistantText ? [{ role: "assistant", content: s.assistantText }] : [])];
      const c = await classify(convo, row);
      if (c) {
        await sql`
          update chat_sessions set conclusion = ${c.conclusion}, topics = ${c.topics}, customer_type = ${c.customer_type},
            sentiment = ${c.sentiment}, summary = ${c.summary},
            products = array(select distinct unnest(products || ${c.products}::text[])), classified_at = now()
          where id = ${input.sessionId}`;
      }
    }
  } catch (e) {
    console.error("[analytics] record failed", (e as Error).message);
  }
}

const storeTranscripts = () => process.env.ANALYTICS_STORE_TRANSCRIPTS !== "off";

function decodeHeader(v: string | null) {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Keep only origin + path of the host page (query strings can carry personal data). */
function cleanUrl(u?: string) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return (url.origin + url.pathname).slice(0, 300);
  } catch {
    return null;
  }
}

// ---------- AI classification of the conversation ----------

const Classification = z.object({
  conclusion: z.enum(CONCLUSIONS),
  topics: z.array(z.enum(TOPICS)),
  products: z.array(z.enum(PRODUCT_LINES)),
  customer_type: z.enum(["contractor", "landscape_architect", "distributor", "homeowner", "other", "unknown"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  summary: z.string(),
});

const CLASSIFIER_PROMPT = `You label website chat conversations between visitors and the Permaloc assistant (aluminum landscape edging) for an internal reporting dashboard.
Return:
- conclusion: how the conversation ended, the single best fit.
  lead_submitted = visitor's contact details were sent to sales; product_recommended = visitor got a specific product recommendation;
  referred_to_specialist = sent to a Permaloc product specialist; found_dealer_or_rep = got a rep, dealer or where-to-buy answer;
  quantity_estimate = got a materials/quantity calculation; question_answered = a product, spec or install question was answered;
  unresolved = the assistant could not help or the visitor seemed unsatisfied; abandoned = visitor left after little or no real exchange;
  off_topic = nothing to do with Permaloc.
  When several apply, prefer the earliest in that list.
- topics: every subject the visitor raised.
- products: Permaloc product lines that were discussed or recommended.
- customer_type: who the visitor appears to be, or unknown.
- sentiment: the visitor's apparent satisfaction.
- summary: one plain sentence (max 25 words) on what the visitor wanted and how it ended. Do not include names, emails or phone numbers.`;

let anthropic: Anthropic | null = null;

async function classify(convo: { role: string; content: string }[], facts: { lead_submitted: boolean; recommended_product: string | null; transferred_to_specialist: boolean; rep_lookup_region: string | null }) {
  anthropic ??= new Anthropic();
  const transcript = convo
    .slice(-30)
    .map((m) => `${m.role === "user" ? "VISITOR" : "ASSISTANT"}: ${m.content.slice(0, 2000)}`)
    .join("\n\n");
  const known = [
    facts.lead_submitted && "A lead was submitted to sales.",
    facts.recommended_product && `The decision tree recommended: ${facts.recommended_product}.`,
    facts.transferred_to_specialist && "The decision tree routed this to a specialist.",
    facts.rep_lookup_region && `A sales contact lookup ran for ${facts.rep_lookup_region}.`,
  ]
    .filter(Boolean)
    .join(" ");
  try {
    const res = await anthropic.beta.messages.parse({
      model: process.env.ANALYTICS_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Classification) },
      system: CLASSIFIER_PROMPT,
      messages: [{ role: "user", content: `<conversation>\n${transcript}\n</conversation>\n\nKnown facts from the system: ${known || "none"}` }],
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (e) {
    console.error("[analytics] classify failed", (e as Error).message);
    return null;
  }
}
