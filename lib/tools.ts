import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadKnowledge } from "./knowledge";
import { applicationTypes, findExamplePath, walkDecisionTree } from "./decisionTree";
import type { DiagramSpec } from "./diagramTypes";

type BetaTool = Anthropic.Beta.BetaToolUnion;

// ---------- Tool definitions (order is fixed so the prompt cache stays valid) ----------

export function buildTools(): BetaTool[] {
  const { materials } = loadKnowledge();
  const productIds = materials.map((m) => m.id);

  return [
    {
      name: "recommend_product",
      description:
        "Permaloc's official product decision tree. Use it for every product recommendation (which edging/restraint and size to use). " +
        "Pass the visitor's answers so far, in order. It returns either the next question with its valid options " +
        "(status need_answer), or the final recommendation (status recommendation), or transfer_to_specialist. " +
        "Start with answers: [] or with the application type if you already know it. " +
        `Application types: ${applicationTypes().join(", ")}. ` +
        "You may pass several answers at once when the visitor already gave them. Use the option wording returned by the tool.",
      input_schema: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: { type: "string" },
            description: "Answers in question order, starting with the application type. Empty to get the first question.",
          },
        },
        required: ["answers"],
        additionalProperties: false,
      },
    },
    {
      name: "calculate_materials",
      description:
        "Calculate how many Permaloc edging pieces and stakes a project needs. Always use this instead of doing the arithmetic yourself. " +
        "Call it once you know the product line and the total run length. " +
        (productIds.length ? `Known product ids: ${productIds.join(", ")}.` : "No product data is loaded; tell the user to contact Permaloc."),
      input_schema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product line id from the known list." },
          linear_feet: { type: "number", description: "Total length of edging needed, in feet. Convert meters (x 3.281) first." },
          piece_length_ft: { type: "number", description: "Preferred piece length in feet if the line comes in more than one length. Optional." },
          waste_percent: { type: "number", description: "Extra allowance for cuts and overlap, percent. Default 5." },
        },
        required: ["product_id", "linear_feet"],
        additionalProperties: false,
      },
    },
    {
      name: "find_sales_contact",
      description:
        "Look up the Permaloc sales representative or buying route for a US state or Canadian province. " +
        "Use when someone asks where to buy, who their rep is, or wants a dealer/distributor near them.",
      input_schema: {
        type: "object",
        properties: {
          region: { type: "string", description: "Two-letter US state or Canadian province code, e.g. 'MI' or 'ON'." },
          customer_type: {
            type: "string",
            enum: ["contractor", "landscape_architect", "distributor", "homeowner", "other"],
          },
        },
        required: ["region"],
        additionalProperties: false,
      },
    },
    {
      name: "submit_lead",
      description:
        "Send a visitor's contact details and project request to the Permaloc sales team. " +
        "Only call this after the visitor has given at least their name and email (or phone) AND agreed to be contacted. " +
        "Never invent or guess any field.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          customer_type: {
            type: "string",
            enum: ["contractor", "landscape_architect", "distributor", "homeowner", "other"],
          },
          location: { type: "string", description: "City/state or ZIP of the project or business." },
          request_type: {
            type: "string",
            enum: ["quote", "samples", "rep_contact", "spec_help", "dealer_inquiry", "other"],
          },
          products_of_interest: { type: "string" },
          project_details: { type: "string", description: "Quantities, timeline and anything else the visitor shared." },
        },
        required: ["name", "request_type", "project_details"],
        additionalProperties: false,
      },
    },
    {
      name: "show_installation_diagram",
      description:
        "Show the visitor an illustrative cross-section of how a Permaloc product installs (layers, edging, stakes or spikes). " +
        "recommend_product already shows one with every recommendation, so use this only when someone asks to see how a product installs " +
        "outside a recommendation, e.g. 'show me how StructurEdge goes in on concrete'.",
      input_schema: {
        type: "object",
        properties: {
          product: {
            type: "string",
            enum: ["CleanLine", "CleanLine XL", "ProLine", "PermaStrip", "StructurEdge", "BrickBlock", "AsphaltEdge", "AthletEdge", "GeoEdge"],
          },
          application: { type: "string", description: `Optional. One of: ${applicationTypes().join(", ")}.` },
          height_in: { type: "number", description: "Optional product height in inches, to pick the closest size." },
        },
        required: ["product"],
        additionalProperties: false,
      },
    },
    // Lets the bot read a live permaloc.com page when the knowledge base doesn't cover a detail.
    {
      type: "web_fetch_20260209",
      name: "web_fetch",
      allowed_domains: ["permaloc.com"],
      max_uses: 3,
    },
  ];
}

// ---------- Tool implementations ----------

const RecommendInput = z.object({ answers: z.array(z.string().max(200)).max(10) });
const DiagramInput = z.object({ product: z.string().max(40), application: z.string().max(40).optional(), height_in: z.number().positive().max(20).optional() });

function showDiagram(raw: unknown) {
  const input = DiagramInput.parse(raw);
  const answers = findExamplePath(input.product, input.application, input.height_in) ?? findExamplePath(input.product, undefined, input.height_in);
  if (!answers) return { error: `No example install for ${input.product}${input.application ? ` in ${input.application}` : ""}.` };
  const r = walkDecisionTree(answers) as { status: string; diagram?: DiagramSpec; recommendation?: string };
  if (!r.diagram) return { error: "Couldn't draw that one." };
  return {
    status: "shown",
    example: answers.join(" > "),
    shown_product: r.diagram.title,
    note: input.application && answers[0] !== input.application ? `${input.product} isn't recommended for ${input.application} in Permaloc's guide; showed a typical install instead.` : undefined,
    diagram: r.diagram,
  };
}

const CalcInput = z.object({
  product_id: z.string(),
  linear_feet: z.number().positive().max(1_000_000),
  piece_length_ft: z.number().positive().optional(),
  waste_percent: z.number().min(0).max(50).optional(),
});

const RepInput = z.object({
  region: z.string().min(2).max(40),
  customer_type: z.string().optional(),
});

const LeadInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  customer_type: z.string().optional(),
  location: z.string().max(200).optional(),
  request_type: z.string(),
  products_of_interest: z.string().max(1000).optional(),
  project_details: z.string().max(4000),
});

function calculateMaterials(raw: unknown) {
  const input = CalcInput.parse(raw);
  const { materials } = loadKnowledge();
  const product = materials.find((m) => m.id === input.product_id);
  if (!product) {
    return { error: `Unknown product_id '${input.product_id}'. Known: ${materials.map((m) => m.id).join(", ") || "none"}` };
  }
  const lengths = product.piece_length_ft ?? [];
  const pieceLen = input.piece_length_ft && lengths.includes(input.piece_length_ft) ? input.piece_length_ft : lengths[0];
  if (!pieceLen) {
    return { error: `Piece length for ${product.name} isn't in our data. Suggest the visitor contact Permaloc for a takeoff.` };
  }
  const waste = input.waste_percent ?? 5;
  const totalFeet = input.linear_feet * (1 + waste / 100);
  const pieces = Math.ceil(totalFeet / pieceLen);

  let stakes: number | null = null;
  let stakeBasis = "Stake/spike count for this size isn't published in our data - confirm with Permaloc or a distributor.";
  const perPiece = product.stakes_per_piece?.[String(pieceLen)];
  if (perPiece) {
    stakes = pieces * perPiece;
    stakeBasis = `${perPiece} stakes per ${pieceLen} ft piece${product.stake_length_in ? ` (${product.stake_length_in} in stakes)` : ""}`;
  } else if (product.stake_spacing_in) {
    stakes = Math.ceil((totalFeet * 12) / product.stake_spacing_in) + 1;
    stakeBasis = `one spike every ${product.stake_spacing_in} in (typical)`;
  }

  return {
    product: product.name,
    run_length_ft: input.linear_feet,
    waste_percent: waste,
    piece_length_ft: pieceLen,
    other_piece_lengths_ft: lengths.filter((l) => l !== pieceLen),
    pieces_needed: pieces,
    stakes_needed: stakes,
    stake_basis: stakeBasis,
    data_note: product.note,
    note: "Estimate only. Corners, curves and site conditions can change the count; Permaloc or a distributor can confirm a final takeoff.",
    source_url: product.source_url,
  };
}

function findSalesContact(raw: unknown) {
  const input = RepInput.parse(raw);
  const { reps } = loadKnowledge();
  const code = input.region.trim().toUpperCase();
  const matches = reps.filter((r) => r.states.map((s) => s.toUpperCase()).includes(code));
  if (matches.length) return { region: code, reps: matches };
  return {
    region: code,
    reps: [],
    note:
      "No territory-specific rep is in our data for this region. Use the general where-to-buy / contact information from the knowledge base, " +
      "and offer to pass the visitor's details to the sales team (submit_lead) so the right rep can follow up.",
  };
}

async function submitLead(raw: unknown) {
  const lead = LeadInput.parse(raw);
  if (!lead.email && !lead.phone) {
    return { error: "Need an email or phone number before submitting. Ask the visitor for one." };
  }
  const record = { ...lead, submitted_at: new Date().toISOString(), source: "website-chatbot" };
  // Always visible in Vercel logs, so no lead is lost even with no delivery channel set up.
  console.log("[lead]", JSON.stringify(record));

  const deliveries: string[] = [];
  const failures: string[] = [];

  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      (res.ok ? deliveries : failures).push(`webhook ${res.status}`);
    } catch (e) {
      failures.push(`webhook ${(e as Error).message}`);
    }
  }

  if (process.env.RESEND_API_KEY && process.env.LEAD_TO_EMAIL) {
    const rows = Object.entries(record)
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join("");
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.LEAD_FROM_EMAIL || "Permaloc Chatbot <onboarding@resend.dev>",
          to: process.env.LEAD_TO_EMAIL.split(",").map((s) => s.trim()),
          reply_to: lead.email || undefined,
          subject: `New chatbot lead: ${lead.name}${lead.company ? ` (${lead.company})` : ""} - ${lead.request_type}`,
          html: `<h2>New lead from the website chatbot</h2><table>${rows}</table>`,
        }),
      });
      (res.ok ? deliveries : failures).push(`email ${res.status}`);
    } catch (e) {
      failures.push(`email ${(e as Error).message}`);
    }
  }

  if (failures.length && !deliveries.length) {
    console.error("[lead] delivery failed", failures);
    return { ok: false, message: "Saving the request failed. Give the visitor Permaloc's phone/email from the knowledge base instead." };
  }
  return { ok: true, message: deliveries.length ? "The sales team has the request and will follow up." : "Request recorded for the sales team." };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function runTool(name: string, input: unknown): Promise<{ content: string; isError: boolean; diagram?: DiagramSpec }> {
  try {
    let result: unknown;
    if (name === "recommend_product") result = walkDecisionTree(RecommendInput.parse(input).answers);
    else if (name === "show_installation_diagram") result = showDiagram(input);
    else if (name === "calculate_materials") result = calculateMaterials(input);
    else if (name === "find_sales_contact") result = findSalesContact(input);
    else if (name === "submit_lead") result = await submitLead(input);
    else return { content: `Unknown tool ${name}`, isError: true };
    const isError = typeof result === "object" && result !== null && "error" in result;
    // The drawing goes to the chat window; the model only learns that it was shown.
    let diagram: DiagramSpec | undefined;
    if (result && typeof result === "object" && "diagram" in result && (result as { diagram?: DiagramSpec }).diagram) {
      const { diagram: d, ...rest } = result as { diagram: DiagramSpec };
      diagram = d;
      result = { ...rest, diagram_shown: `A cross-section of ${d.title} (${d.subtitle}) is shown to the visitor below your reply.` };
    }
    return { content: JSON.stringify(result), isError, diagram };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { content: `Invalid input: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true };
    }
    console.error(`[tool ${name}]`, e);
    return { content: "Tool failed unexpectedly.", isError: true };
  }
}
