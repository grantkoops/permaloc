"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi! I'm the Permaloc assistant. I can help with product specs, installation, estimating how much edging you need, or finding where to buy. What are you working on?";

const SUGGESTIONS = [
  "Which edging is best for paver patios?",
  "How much edging do I need for 240 ft?",
  "Where can I buy Permaloc in Ohio?",
  "Can I get samples or a quote?",
];

const STORAGE_KEY = "permaloc-chat-v1";

export default function Chat({ embedded }: { embedded: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Thinking…");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let reply = "";
    let needBreak = false;
    const update = () =>
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: reply }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
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
      setBusy(false);
      setStatus(null);
      abortRef.current = null;
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
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
          m.content || m.role === "user" ? <Bubble key={i} role={m.role} content={m.content} /> : null,
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
      <div className="footnote">AI assistant · answers may be imperfect, so confirm specs with Permaloc</div>
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
