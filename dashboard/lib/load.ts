import { NotConfigured, isMissingTable } from "./queries";

export type Notice = "no-db" | "no-table" | "error";

/** Run dashboard queries, turning setup problems into a friendly notice. */
export async function load<T>(fn: () => Promise<T>): Promise<{ data: T; notice?: undefined } | { data?: undefined; notice: Notice }> {
  try {
    return { data: await fn() };
  } catch (e) {
    if (e instanceof NotConfigured) return { notice: "no-db" };
    if (isMissingTable(e)) return { notice: "no-table" };
    console.error("[dashboard]", e);
    return { notice: "error" };
  }
}
