"use client";

import { useEffect, useRef, useState } from "react";
import type { DiagramSpec } from "@/lib/diagramTypes";
import CrossSection from "./CrossSection";

type Msg = { role: "user" | "assistant"; content: string; diagram?: DiagramSpec };

const CAD_URL = "https://permaloc.com/cad-by-application/";

const GREETING =
  "Hi! I'm the Permaloc assistant. I can help with product specs, installation, estimating how much edging you need, or finding where to buy. What are you working on?";

const SUGGESTIONS = [
  "Help me choose the right edging",
  "Which edging is best for paver patios?",
  "How much edging do I need for 240 ft?",
  "Where can I buy Permaloc in Ohio?",
  "Can I get samples or a quote?",
];

const STORAGE_KEY = "permaloc-chat-v1";
const SESSION_KEY = "permaloc-chat-session";
const VISITOR_KEY = "permaloc-chat-visitor";

function newId() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");
}

// Anonymous ids for the reporting dashboard: one per conversation, one per browser.
function storedId(storage: Storage | undefined, key: string) {
  try {
    let id = storage?.getItem(key);
    if (!id) {
      id = newId();
      storage?.setItem(key, id);
    }
    return id;
  } catch {
    return newId();
  }
}

function analyticsMeta() {
  const pageUrl = new URLSearchParams(location.search).get("ref") || (window.parent === window ? location.href : document.referrer);
  return {
    sessionId: storedId(window.sessionStorage, SESSION_KEY),
    visitorId: storedId(window.localStorage, VISITOR_KEY),
    pageUrl,
  };
}

export default function Chat({ embedded }: { embedded: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<DiagramSpec | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the conversation across page navigations on the host site.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history: Msg[] = [...messages, { role: "user", content }];
    const apiHistory = history.map(({ role, content }) => ({ role, content }));
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setQuickReplies([]);
    setBusy(true);
    setStatus("Thinking…");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let reply = "";
    let needBreak = false;
    let options: string[] = [];
    let diagram: DiagramSpec | undefined;
    const update = () =>
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: reply, diagram }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiHistory, ...analyticsMeta() }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") {
            if (ev.text) {
              // keep text from separate tool rounds in separate paragraphs
              if (needBreak && reply) reply += "\n\n";
              needBreak = false;
              reply += ev.text;
              setStatus(null);
              update();
            } else {
              needBreak = true; // empty text event = a tool round ended
            }
          } else if (ev.type === "diagram") {
            diagram = ev.spec;
            update();
          } else if (ev.type === "options") {
            options = Array.isArray(ev.options) ? ev.options : [];
          } else if (ev.type === "status") {
            setStatus(ev.text);
          } else if (ev.type === "error") {
            reply = (reply + "\n\n" + ev.text).trim();
            update();
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        reply = reply || `Sorry, I couldn't connect. ${(e as Error).message}`;
      }
    } finally {
      update();
      setQuickReplies(options);
      setBusy(false);
      setStatus(null);
      abortRef.current = null;
    }
  }

  function reset() {
    abortRef.current?.abort();
    try {
      sessionStorage.removeItem(SESSION_KEY); // "Start over" begins a new session in the reports
    } catch {}
    setMessages([]);
    setQuickReplies([]);
  }

  function close() {
    window.parent?.postMessage({ type: "permaloc-chat:close" }, "*");
  }

  return (
    <div className={`chat ${embedded ? "embedded" : "standalone"}`}>
      <header className="chat-header">
        <div className="brand">
          <div className="logo" aria-hidden>P</div>
          <div>
            <div className="title">Permaloc Assistant</div>
            <div className="subtitle">Aluminum landscape edging</div>
          </div>
        </div>
        <div className="header-actions">
          {messages.length > 0 && (
            <button className="icon-btn" onClick={reset} title="Start over" aria-label="Start over">↺</button>
          )}
          {embedded && (
            <button className="icon-btn" onClick={close} title="Close" aria-label="Close chat">✕</button>
          )}
        </div>
      </header>

      <div className="messages" ref={listRef} aria-live="polite">
        <Bubble role="assistant" content={GREETING} />
        {messages.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.content || m.role === "user" || m.diagram ? (
            <div key={i} className={`turn ${m.role}`}>
              {(m.content || m.role === "user") && <Bubble role={m.role} content={m.content} />}
              {m.diagram && <DiagramCard spec={m.diagram} onOpen={() => setZoomed(m.diagram!)} />}
            </div>
          ) : null,
        )}
        {!busy && quickReplies.length > 0 && (
          <div className="suggestions quick-replies">
            {quickReplies.map((o) => (
              <button key={o} onClick={() => send(o)}>{o}</button>
            ))}
          </div>
        )}
        {status && <div className="status"><span className="dots"><i /><i /><i /></span>{status}</div>}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about products, installs, quantities…"
          rows={1}
          maxLength={4000}
          aria-label="Message"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">➤</button>
      </form>
      {zoomed && <DiagramOverlay spec={zoomed} onClose={() => setZoomed(null)} />}
      <div className="footnote">AI assistant · answers may be imperfect, so confirm specs with Permaloc</div>
    </div>
  );
}

function DiagramCard({ spec, onOpen }: { spec: DiagramSpec; onOpen: () => void }) {
  return (
    <div className="diagram-card">
      <button className="diagram-open" onClick={onOpen} aria-label={`Enlarge cross-section of ${spec.title}`}>
        <CrossSection spec={spec} />
        <span className="diagram-hint">Tap to enlarge</span>
      </button>
      <p className="diagram-caption">
        Illustrative cross-section, not for construction. Confirm details with{" "}
        <a href={CAD_URL} target="_blank" rel="noopener">Permaloc&rsquo;s CAD drawings</a>.
      </p>
    </div>
  );
}

function DiagramOverlay({ spec, onClose }: { spec: DiagramSpec; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `permaloc-${spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="diagram-overlay" role="dialog" aria-modal="true" aria-label={spec.title} onClick={onClose}>
      <div className="diagram-sheet" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="diagram-actions">
          <button onClick={save}>Save image</button>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <CrossSection spec={spec} />
        <p className="diagram-caption">
          Illustrative cross-section, not for construction. Confirm details with{" "}
          <a href={CAD_URL} target="_blank" rel="noopener">Permaloc&rsquo;s CAD drawings</a>.
        </p>
      </div>
    </div>
  );
}

function Bubble({ role, content }: Msg) {
  return (
    <div className={`bubble ${role}`}>
      {role === "assistant" ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} /> : content}
    </div>
  );
}

// Small, safe markdown subset: escape everything, then add bold, italics, links, lists, paragraphs.
function renderMarkdown(src: string): string {
  const esc = src.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of esc.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul || ol)![1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(h ? `<p><strong>${inline(h[1])}</strong></p>` : `<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}
