# Permaloc chatbot reports

A separate, password-protected web app that reports on how people use the Permaloc assistant. It reads the `chat_sessions` table the chatbot writes to. It has no access to the chatbot itself, and the chatbot has no link to it.

## What it shows

- **Usage:** people (unique browsers) and sessions in the past 24 hours, 7 days, 30 days and year to date, each compared with the period before.
- **For any date range** (24 hours, 7 days, 30 days, this month, year to date, all time, or custom dates): sessions, people, returning visitors, engagement, recommendations, leads, and a per-day (or per-hour) chart you can switch between people, sessions and leads.
- **Where people are:** top countries, states/provinces and cities.
- **What happened:** how sessions ended (lead sent, product recommended, dealer found, question answered, unresolved, left early, …), products discussed, exact products recommended, topics, applications, who's asking (contractor, homeowner, …), lead request types, visitor sentiment, and the pages chats started on.
- **Sessions:** a searchable list of every conversation with its AI summary, and a detail page with the full transcript.
- **Export:** CSV of the sessions matching the current filters.

Click any country, state, conclusion, product or topic to filter the whole dashboard by it. Filters live in the URL, so any view can be bookmarked or shared with someone who has the password.

## How the data is collected

On every chat turn the chatbot (`../lib/analytics.ts`) upserts one row per conversation:

| Field | Source |
|---|---|
| Location | Vercel's IP geolocation headers (country, state/province, city). IP addresses are not stored. |
| Person | A random ID kept in the visitor's browser, so repeat visits count as one person. |
| Session | A random ID per conversation. "Start over" in the chat begins a new session. |
| Page | The page the chat was opened on (origin and path only; query strings are dropped). |
| Products, application, recommendation, lead, rep lookup | Taken directly from the chatbot's tool calls, plus product names mentioned in the conversation. |
| Conclusion, topics, visitor type, sentiment, summary | Claude reads the conversation after each turn and labels it (`ANALYTICS_CLASSIFY`). If that is off or fails, the conclusion falls back to simple rules. |
| Transcript | The conversation text, for the session detail page (`ANALYTICS_STORE_TRANSCRIPTS=off` to disable). Transcripts can include the names, emails and phone numbers visitors type in for leads. |

Recording happens after the reply has finished streaming, so it never slows the chat down, and a database error never breaks it.

## Setup on Vercel

1. **Database.** In the chatbot's Vercel project, add a Postgres database (Storage → Neon, or any Postgres provider) and make sure `DATABASE_URL` is set on the chatbot project. Redeploy the chatbot and send one chat message; the table is created automatically.
2. **Dashboard project.** In Vercel, import the same GitHub repository a second time as a new project and set **Root Directory** to `dashboard`. Give it its own domain, for example `permaloc-reports.vercel.app`.
3. **Dashboard environment variables** (Project → Settings → Environment Variables):
   - `DATABASE_URL`: the same database. A read-only database user is best, since the dashboard only reads.
   - `DASHBOARD_PASSWORD`: the login password. Use a long one.
   - `DASHBOARD_SESSION_SECRET`: a random string, e.g. the output of `openssl rand -hex 32`.
   - Optional: `DASHBOARD_SESSION_HOURS` (default 12) and `DASHBOARD_TZ` (default `America/Detroit`, used for days, months and year to date).
4. Deploy, open the dashboard's URL and sign in.

To sign everyone out, change the password or the session secret and redeploy.

## Security notes

- Every page and API route requires the login cookie (`middleware.ts`). The cookie is HMAC-signed, HTTP-only, `SameSite=Strict`, secure in production, and expires.
- Wrong passwords are slowed down and limited to 8 tries per IP per 15 minutes per server instance. For stronger protection, add a Vercel Firewall rate-limit rule on `/api/login`, or turn on Vercel Deployment Protection for the whole project.
- Pages are marked `noindex`, can't be framed by other sites, and aren't cached.

## Trying it locally

```bash
cd dashboard && npm install && cp .env.example .env.local
```

Fill in `.env.local`, then load about a year of made-up sessions (IDs start with `demo-`) so there's something to look at:

```bash
DATABASE_URL=postgres://… npx tsx ../scripts/seed_demo_analytics.ts
```

```bash
npm run dev
```

Open http://localhost:3001. Remove the demo data with `DATABASE_URL=postgres://… npx tsx ../scripts/seed_demo_analytics.ts --clear`. Don't run the seed script against the production database unless you clear it afterwards.

## Cost

AI labeling makes one extra Claude call per chat turn, at low effort, reading the conversation so far. To lower the cost, set `ANALYTICS_MODEL=claude-haiku-5-5` on the chatbot project, or `ANALYTICS_CLASSIFY=off` to rely on rules only (you lose topics, visitor type, sentiment and summaries).
