# Permaloc website chatbot

An AI assistant for permaloc.com, built on Claude (Anthropic API) with Next.js and hosted on Vercel. It appears as a chat bubble on any website through a single script tag.

## What it does

| Capability | How |
|---|---|
| Product recommendations | The `recommend_product` tool walks Permaloc's decision tree (`knowledge/decision-tree.json`, built from `knowledge/source/decision-tree.xlsx`) one question at a time. The chat shows each question's options as buttons. Configurations the tree sends to a specialist become a lead. |
| Installation diagrams | Every recommendation shows a to-scale, labeled cross-section built from the visitor's answers (`lib/diagram.ts` → `app/embed/CrossSection.tsx`). It can be enlarged and saved as SVG. `show_installation_diagram` draws a typical install on request. Drawing conventions follow Permaloc's CAD details at permaloc.com/cad-by-application. |
| Product Q&A | Answers from `knowledge/permaloc.md`, which is loaded into the system prompt and prompt-cached. It can also read live permaloc.com pages (web fetch is limited to that domain). |
| Installation help | Uses the install steps and FAQ in the knowledge base, with links to the relevant pages. |
| Quantity estimates | The `calculate_materials` tool does exact arithmetic for pieces and stakes from `knowledge/materials.json`. |
| Where to buy / rep lookup | The `find_sales_contact` tool looks up `knowledge/reps.json` by state. If there's no match, it falls back to the dealer locator and the 1-800 number. |
| Usage reports | Each conversation is saved to Postgres (`lib/analytics.ts`) with location, products, outcome and an AI summary. A separate, password-protected dashboard in `dashboard/` reports on it. |
| Lead capture | The bot collects contact and project details in conversation, confirms them, then `submit_lead` sends them to email (Resend) and/or a webhook (Zapier, HubSpot, etc.). Every lead is also written to the Vercel logs. |

## Files

```
app/api/chat/route.ts   Claude tool loop, streams NDJSON to the browser
app/embed/              Chat UI (loaded in the bubble's iframe; /embed?standalone opens it full-screen)
app/page.tsx            Demo/test page with the bubble installed
public/widget.js        Embeddable bubble script
lib/prompt.ts           System prompt: tone, rules, what the bot will and won't do
lib/tools.ts            Tool definitions and implementations
lib/analytics.ts        Saves each session for the reporting dashboard
dashboard/              Separate Next.js app: password-protected reports (deploy as its own Vercel project)
knowledge/              Everything the bot knows. Edit these files to change its answers.
```

## Setup

1. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.
2. Run `npm install`, then `npm run dev`, then open http://localhost:3000.

On Vercel, set the same variables under Project → Settings → Environment Variables, then redeploy.

## Reporting dashboard

Set `DATABASE_URL` on this project to a Postgres database (for example Neon from the Vercel Marketplace) and the chatbot starts saving each session. The table is created automatically on the first chat. The reports live in a separate app; setup is in [dashboard/README.md](dashboard/README.md).

## Installing on permaloc.com

Add this before `</body>`, either site-wide or in the footer template or tag manager:

```html
<script src="https://permaloc.vercel.app/widget.js" data-teaser="Questions about edging? Ask me!" defer></script>
```

Optional attributes: `data-color` (bubble color), `data-position="left"`, `data-teaser`.
For production, set `ALLOWED_FRAME_ANCESTORS="https://www.permaloc.com https://permaloc.com"` so other sites can't embed the chat.

## Keeping the knowledge current

- **Diagrams:** after changing the decision tree, run `npx tsx scripts/check_diagrams.ts` to confirm every path still produces a drawing. To review drawings, run the app with `DIAGRAM_PREVIEW=1` and open `/embed/diagrams-preview`. That page returns a 404 otherwise.

- **Decision tree:** edit `knowledge/source/decision-tree.xlsx` (same columns: Question/Answer pairs, FinalAnswer, RecommendedProductURL, RecommendationReason), then run `python3 scripts/build_decision_tree.py` (needs `pip install openpyxl`) and commit both files. The bot's recommendations come only from this tree.

- `knowledge/permaloc.md` was compiled from search-indexed permaloc.com pages and spec PDFs. Have someone at Permaloc review it, especially the items marked **NOT FOUND** and the conflicts it notes.
- Add sales reps to `knowledge/reps.json`, for example:
  `[{"name":"Jane Doe","territory":"Great Lakes","states":["MI","OH","IN"],"phone":"…","email":"…"}]`
- Every `.md` file in `knowledge/` is included automatically.

## Cost and model

The default model is `claude-opus-5-5` at `CHAT_EFFORT=low`. The knowledge base is prompt-cached, so repeat questions mostly read from cache. To cut cost per conversation, set `CHAT_MODEL=claude-sonnet-5-5` or `claude-haiku-5-5`. Server-side refusal fallback is enabled (`fallbacks: "default"`).

The in-memory rate limit (20 messages per minute per IP) is best effort only. Before launch, add a Vercel Firewall rate-limit rule on `/api/chat`.
