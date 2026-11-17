import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { newTurnSignals, noteToolCall, recordTurn } from "@/lib/analytics";
import { buildSystemPrompt } from "@/lib/prompt";
import { buildTools, runTool } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CHAT_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.CHAT_EFFORT || "low") as "low" | "medium" | "high";
const MAX_HISTORY = 30; // messages kept from the client
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOOL_ROUNDS = 6;

const client = new Anthropic();

// Best-effort per-IP limit. Serverless instances don't share memory, so put
// Vercel Firewall rate limiting in front of this for production traffic.
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

type ClientMessage = { role: "user" | "assistant"; content: string };

function sanitize(body: unknown): Anthropic.Beta.BetaMessageParam[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const msgs = ((body as { messages: unknown[] }).messages)
    .filter((m): m is ClientMessage => {
      const r = m as ClientMessage;
      return (r?.role === "user" || r?.role === "assistant") && typeof r.content === "string" && r.content.trim() !== "";
    })
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return Response.json({ error: "Too many messages. Please wait a minute." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const messages = sanitize(body);
  if (!messages) return Response.json({ error: "Invalid request" }, { status: 400 });

  // Analytics: what the visitor sent, plus what happened this turn (recorded after the response ends).
  const visitorHistory = messages.map((m) => ({ role: m.role, content: m.content as string }));
  const signals = newTurnSignals();
  const meta = (body ?? {}) as { sessionId?: unknown; visitorId?: unknown; pageUrl?: unknown };
  if (typeof meta.sessionId === "string") {
    after(() =>
      recordTurn({
        sessionId: meta.sessionId as string,
        visitorId: typeof meta.visitorId === "string" ? meta.visitorId : undefined,
        pageUrl: typeof meta.pageUrl === "string" ? meta.pageUrl : undefined,
        headers: req.headers,
        messages: visitorHistory,
        signals,
      }),
    );
  }

  const system = buildSystemPrompt();
  const tools = buildTools();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const msgStream = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 8000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default", // if a safety classifier declines, the API retries on a fallback model
              output_config: { effort: EFFORT },
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              tools,
              messages,
            },
            { signal: req.signal },
          );
          msgStream.on("text", (delta) => {
            signals.assistantText += delta;
            send({ type: "text", text: delta });
          });
          msgStream.on("streamEvent", (event) => {
            if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
              send({ type: "status", text: "Checking permaloc.com…" });
            }
          });

          const message = await msgStream.finalMessage();
          const u = message.usage;
          console.log(`[chat] round=${round} stop=${message.stop_reason} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens}`);

          if (message.stop_reason === "refusal") {
            send({ type: "text", text: "\n\nSorry, I can't help with that one. For anything about Permaloc products, I'm happy to help." });
            break;
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }

          const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

          messages.push({ role: "assistant", content: message.content });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const t of toolUses) {
            send({ type: "status", text: statusFor(t.name) });
            const r = await runTool(t.name, t.input);
            noteToolCall(signals, t.name, t.input, r.content, r.isError);
            if (t.name === "submit_lead" && !r.isError) send({ type: "lead_submitted" });
            if (r.diagram) send({ type: "diagram", spec: r.diagram });
            if (t.name === "recommend_product" && !r.isError) {
              // Let the chat window show the decision tree's options as quick-reply buttons.
              const parsed = JSON.parse(r.content) as { status?: string; options?: string[] };
              const opts = parsed.status === "need_answer" || parsed.status === "invalid_answer" ? parsed.options : undefined;
              send({ type: "options", options: opts && opts.length <= 40 ? opts : [] });
            }
            results.push({ type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError || undefined });
          }
          messages.push({ role: "user", content: results });
          if (signals.assistantText) signals.assistantText += "\n\n";
          send({ type: "text", text: "" });
        }
        send({ type: "done" });
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) {
          // visitor closed the widget
        } else if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.OverloadedError) {
          send({ type: "error", text: "We're busy right now. Please try again in a moment." });
        } else if (err instanceof Anthropic.APIError) {
          console.error("[chat] API error", err.status, err.message);
          send({ type: "error", text: "Something went wrong on our side. Please try again." });
        } else {
          console.error("[chat] error", err);
          send({ type: "error", text: "Something went wrong on our side. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function statusFor(tool: string) {
  if (tool === "recommend_product") return "Checking the product guide…";
  if (tool === "show_installation_diagram") return "Drawing the cross-section…";
  if (tool === "calculate_materials") return "Calculating materials…";
  if (tool === "find_sales_contact") return "Looking up your sales contact…";
  if (tool === "submit_lead") return "Sending your details to the sales team…";
  return "Working…";
}
