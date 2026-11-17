import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  sql ??= postgres(url, { max: 3, prepare: false, idle_timeout: 20, onnotice: () => {} });
  return sql;
}

export const TZ = process.env.DASHBOARD_TZ || "America/Detroit";
