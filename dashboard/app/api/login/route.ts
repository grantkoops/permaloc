import { NextResponse } from "next/server";
import { COOKIE, checkPassword, createToken, sessionHours } from "@/lib/auth";

// Slow down password guessing: 8 failed tries per IP per 15 minutes (per server instance).
const fails = new Map<string, number[]>();
const WINDOW = 15 * 60_000;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= 8) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  if (!process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "The dashboard password isn't configured (DASHBOARD_PASSWORD)." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password.slice(0, 500) : "";
  if (!(await checkPassword(password))) {
    recent.push(now);
    fails.set(ip, recent);
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  fails.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.round(sessionHours() * 3600),
  });
  return res;
}
