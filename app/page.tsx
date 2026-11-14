import Script from "next/script";

// Demo page: a stand-in for permaloc.com with the chat bubble installed exactly as it would be on the real site.
export default function Home() {
  return (
    <main className="demo">
      <section className="demo-hero">
        <p className="eyebrow">Test page · not the real permaloc.com</p>
        <h1>Permaloc chatbot preview</h1>
        <p>
          The chat bubble in the bottom-right corner is the same widget that will go on permaloc.com. Click it and try a
          product question, a quantity estimate (&ldquo;how much edging for 180 ft of CleanLine?&rdquo;), a where-to-buy question, or ask
          for a quote to test lead capture.
        </p>
        <p>
          <a href="/embed?standalone">Open the chat full-screen</a>
        </p>
      </section>

      <section className="demo-card">
        <h2>Install on the website</h2>
        <p>Paste this one line before <code>&lt;/body&gt;</code> on every page (or add it once in the site&rsquo;s footer or tag manager):</p>
        <pre>
          <code>{`<script src="https://permaloc-assistant.vercel.app/widget.js" defer></script>`}</code>
        </pre>
        <p>Optional attributes:</p>
        <ul>
          <li><code>data-color=&quot;#1f5130&quot;</code>: bubble color</li>
          <li><code>data-position=&quot;left&quot;</code>: show it bottom-left instead</li>
          <li><code>data-teaser=&quot;Questions? Ask our edging assistant&quot;</code>: one-time prompt shown next to the bubble</li>
        </ul>
      </section>

      <Script src="/widget.js" strategy="afterInteractive" data-teaser="Questions about edging? Ask me!" />
    </main>
  );
}
