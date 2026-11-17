import Link from "next/link";

export default function Shell({ active, exportHref, children }: { active: "overview" | "sessions"; exportHref?: string; children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden>P</div>
          <div>
            <div className="brand-title">Permaloc Assistant</div>
            <div className="brand-sub">Chatbot reports</div>
          </div>
        </div>
        <nav className="tabs">
          <Link href="/" className={active === "overview" ? "on" : ""}>Overview</Link>
          <Link href="/sessions" className={active === "sessions" ? "on" : ""}>Sessions</Link>
        </nav>
        <div className="top-actions">
          {exportHref && <a className="btn" href={exportHref}>Export CSV</a>}
          <form action="/api/logout" method="post">
            <button className="btn ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

export function SetupNotice({ kind }: { kind: "no-db" | "no-table" | "error" }) {
  return (
    <section className="card notice">
      {kind === "no-db" && (
        <>
          <h3>Connect the database</h3>
          <p>Set <code>DATABASE_URL</code> for this dashboard to the same Postgres database the chatbot uses, then redeploy.</p>
        </>
      )}
      {kind === "no-table" && (
        <>
          <h3>No conversations recorded yet</h3>
          <p>The chatbot creates its table on the first chat after <code>DATABASE_URL</code> is set on the chatbot project. Open the chat, send a message, then refresh this page.</p>
        </>
      )}
      {kind === "error" && (
        <>
          <h3>Couldn&rsquo;t load the reports</h3>
          <p>The database didn&rsquo;t respond. Check <code>DATABASE_URL</code> and try again. Details are in the server logs.</p>
        </>
      )}
    </section>
  );
}
