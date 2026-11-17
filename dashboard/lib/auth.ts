// Password login with a signed, expiring cookie. Uses Web Crypto so it runs in middleware.

export const COOKIE = "plc_dash";

const enc = new TextEncoder();

function secret() {
  const s = process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!s) throw new Error("DASHBOARD_PASSWORD is not set");
  // Including the password means changing it signs everyone out.
  return `${s}|${process.env.DASHBOARD_PASSWORD ?? ""}`;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sessionHours() {
  const h = Number(process.env.DASHBOARD_SESSION_HOURS);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

export async function createToken() {
  const exp = Date.now() + sessionHours() * 3600_000;
  return `${exp}.${await hmac(`v1.${exp}`)}`;
}

export async function verifyToken(token: string | undefined) {
  if (!token || !process.env.DASHBOARD_PASSWORD) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  return safeEqual(sig, await hmac(`v1.${exp}`));
}

/** Compare hashes so timing doesn't leak the password length or prefix. */
export async function checkPassword(given: string) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmac(`pw.${given}`), hmac(`pw.${expected}`)]);
  return safeEqual(a, b);
}
