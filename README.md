# Permaloc website chatbot

An AI assistant for permaloc.com, built on Claude (Anthropic API) with Next.js and hosted on Vercel. It appears as a chat bubble on any website through a single script tag.

## What it does

| Capability | How |
|---|---|
| Product Q&A | Answers from `knowledge/permaloc.md`, which is loaded into the system prompt and prompt-cached. It can also read live permaloc.com pages (web fetch is limited to that domain). |
| Installation help | Uses the install steps and FAQ in the knowledge base, with links to the relevant pages. |
| Quantity estimates | The `calculate_materials` tool does exact arithmetic for pieces and stakes from `knowledge/materials.json`. |
| Where to buy / rep lookup | The `find_sales_contact` tool looks up `knowledge/reps.json` by state. If there's no match, it falls back to the dealer locator and the 1-800 number. |
| Lead capture | The bot collects contact and project details in conversation, confirms them, then `submit_lead` sends them to email (Resend) and/or a webhook (Zapier, HubSpot, etc.). Every lead is also written to the Vercel logs. |

## Files

```
app/api/chat/route.ts   Claude tool loop, streams NDJSON to the browser
app/embed/              Chat UI (loaded in the bubble's iframe; /embed?standalone opens it full-screen)
app/page.tsx            Demo/test page with the bubble installed
public/widget.js        Embeddable bubble script
lib/prompt.ts           System prompt: tone, rules, what the bot will and won't do
lib/tools.ts            Tool definitions and implementations
knowledge/              Everything the bot knows. Edit these files to change its answers.
```

## Setup

1. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.
2. Run `npm install`, then `npm run dev`, then open http://localhost:3000.

On Vercel, set the same variables under Project → Settings → Environment Variables, then redeploy.

## Installing on permaloc.com

Add this before `</body>`, either site-wide or in the footer template or tag manager:

```html
<script src="https://permaloc-assistant.vercel.app/widget.js" data-teaser="Questions about edging? Ask me!" defer></script>
```

Optional attributes: `data-color` (bubble color), `data-position="left"`, `data-teaser`.
For production, set `ALLOWED_FRAME_ANCESTORS="https://www.permaloc.com https://permaloc.com"` so other sites can't embed the chat.

## Keeping the knowledge current

- `knowledge/permaloc.md` was compiled from search-indexed permaloc.com pages and spec PDFs. Have someone at Permaloc review it, especially the items marked **NOT FOUND** and the conflicts it notes.
- Add sales reps to `knowledge/reps.json`, for example:
  `[{"name":"Jane Doe","territory":"Great Lakes","states":["MI","OH","IN"],"phone":"…","email":"…"}]`
- Every `.md` file in `knowledge/` is included automatically.

## Cost and model

The default model is `claude-opus-5-5` at `CHAT_EFFORT=low`. The knowledge base is prompt-cached, so repeat questions mostly read from cache. To cut cost per conversation, set `CHAT_MODEL=claude-sonnet-5-5` or `claude-haiku-5-5`. Server-side refusal fallback is enabled (`fallbacks: "default"`).

The in-memory rate limit (20 messages per minute per IP) is best effort only. Before launch, add a Vercel Firewall rate-limit rule on `/api/chat`.
