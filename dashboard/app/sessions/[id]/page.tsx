import Link from "next/link";
import { notFound } from "next/navigation";
import Shell, { SetupNotice } from "@/components/Shell";
import { TZ } from "@/lib/db";
import { dateTime, duration } from "@/lib/format";
import { CONCLUSION_LABELS, CUSTOMER_LABELS, REQUEST_LABELS, TOPIC_LABELS, countryName, label, regionName } from "@/lib/labels";
import { load } from "@/lib/load";
import { session } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) notFound();
  const res = await load(() => session(id));
  if (res.notice) return <Shell active="sessions"><SetupNotice kind={res.notice} /></Shell>;
  const s = res.data;
  if (!s) notFound();

  const facts: [string, React.ReactNode][] = [
    ["Started", dateTime(s.started_at, TZ)],
    ["Length", `${duration(s.started_at, s.last_message_at)} · ${s.user_messages} visitor messages`],
    ["Location", [s.city, regionName(s.country, s.region), countryName(s.country)].filter((x) => x && x !== "Unknown").join(", ") || "Unknown"],
    ["Page", s.page_url ? <a href={s.page_url} target="_blank" rel="noopener noreferrer">{s.page_url.replace(/^https?:\/\//, "")}</a> : "Unknown"],
    ["Visitor", s.visitor_id ? `${s.visitor_sessions} session${s.visitor_sessions === 1 ? "" : "s"} from this browser` : "Unknown"],
    ["Conclusion", <span key="c" className={`pill c-${s.conclusion ?? "none"}`}>{label(CONCLUSION_LABELS, s.conclusion)}</span>],
    ["Topics", s.topics.map((t) => label(TOPIC_LABELS, t)).join(", ") || "–"],
    ["Products", s.products.join(", ") || "–"],
    ["Application", s.application ?? "–"],
    ["Recommended", s.recommended_product ?? "–"],
    ["Lead", s.lead_submitted ? `Yes · ${label(REQUEST_LABELS, s.lead_request_type)}` : "No"],
    ["Visitor type", s.customer_type ? label(CUSTOMER_LABELS, s.customer_type) : "–"],
    ["Sentiment", s.sentiment ?? "–"],
    ["Specialist", s.transferred_to_specialist ? "Routed to a product specialist" : "–"],
    ["Rep lookup", s.rep_lookup_region ?? "–"],
    ["Tools used", s.tools_used.join(", ") || "–"],
  ];

  return (
    <Shell active="sessions">
      <p><Link href="/sessions" className="link">← All sessions</Link></p>
      <div className="detail">
        <section className="card">
          <h3>Session</h3>
          {s.summary && <p className="lede">{s.summary}</p>}
          <dl className="facts">
            {facts.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </section>
        <section className="card">
          <h3>Transcript</h3>
          {!s.transcript?.length ? (
            <p className="empty">Transcript storage is turned off for the chatbot.</p>
          ) : (
            <div className="transcript">
              {s.transcript.map((m, i) => (
                <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
                  <div className="who">{m.role === "user" ? "Visitor" : "Assistant"}</div>
                  <div className="text">{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
