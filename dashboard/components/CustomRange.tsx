"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function CustomRange({ from, to, active }: { from?: string; to?: string; active: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [a, setA] = useState(from ?? "");
  const [b, setB] = useState(to ?? "");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!a) return;
    const p = new URLSearchParams(params.toString());
    p.delete("range");
    p.delete("page");
    p.set("from", a);
    if (b) p.set("to", b);
    else p.delete("to");
    router.push(`${path}?${p.toString()}`);
  }

  return (
    <form className={`custom-range${active ? " on" : ""}`} onSubmit={apply}>
      <label>
        <span className="sr">From</span>
        <input type="date" value={a} onChange={(e) => setA(e.target.value)} aria-label="From date" />
      </label>
      <span aria-hidden>–</span>
      <label>
        <span className="sr">To</span>
        <input type="date" value={b} min={a || undefined} onChange={(e) => setB(e.target.value)} aria-label="To date" />
      </label>
      <button type="submit" disabled={!a}>Apply</button>
    </form>
  );
}
