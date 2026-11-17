import { parseFilters } from "@/lib/filters";
import { bounds, exportRows, isMissingTable, NotConfigured } from "@/lib/queries";

export const dynamic = "force-dynamic";

function cell(v: unknown) {
  if (v == null) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheet apps from running it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const f = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
  try {
    const rows = await exportRows(f, await bounds(f));
    const cols = rows.columns.map((c) => c.name);
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell((r as Record<string, unknown>)[c])).join(","))].join("\r\n");
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="permaloc-chat-sessions-${day}.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof NotConfigured) return Response.json({ error: "DATABASE_URL is not set" }, { status: 500 });
    if (isMissingTable(e)) return new Response("no sessions recorded yet\r\n", { headers: { "Content-Type": "text/csv" } });
    console.error("[export]", e);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
