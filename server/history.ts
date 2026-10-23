import type { PluginHandlerContext } from "@getpaseo/plugin/server";

// The server bundle can see host SDK types, but a registry checkout does not
// install @getpaseo/client. Derive the timeline from the handler context.
type Paseo = PluginHandlerContext["paseo"];
type Timeline = ReturnType<Paseo["agents"]["ref"]>["timeline"];
export type HistoryPage = Awaited<ReturnType<Timeline["refetch"]>>;
export type HistoryEntry = HistoryPage["entries"][number];

/** Freeze the newest boundary, then walk backwards so active sessions cannot grow forever. */
export async function fetchHistory(timeline: Pick<Timeline, "refetch">) {
  const pages: HistoryEntry[][] = [];
  let cursor: HistoryPage["startCursor"] = null;
  let epoch: string | undefined;
  let agent: HistoryPage["agent"] = null;
  const seen = new Set<string>();
  for (;;) {
    const page = await timeline.refetch({
      direction: cursor ? "before" : "tail",
      ...(cursor ? { cursor } : {}),
      limit: 200,
      projection: "projected",
    });
    if (page.error) throw new Error(page.error);
    if (page.staleCursor || page.gap || (epoch !== undefined && (page.epoch !== epoch || page.reset))) {
      throw new Error("Conversation history changed or is incomplete. Please export again.");
    }
    epoch = page.epoch;
    agent ??= page.agent;
    pages.push(page.entries);
    if (!page.hasOlder) break;
    const next = page.startCursor;
    const key = next && `${next.epoch}:${next.seq}`;
    if (!next || !key || seen.has(key) || (cursor && next.seq >= cursor.seq)) {
      throw new Error("History pagination did not advance. No partial export was created.");
    }
    seen.add(key);
    cursor = next;
  }
  if (!agent) throw new Error("Session was not found on this host.");
  const entries = pages.reverse().flat();
  // Some hosts include their boundary entry on both pages.
  const unique = new Map<string, HistoryEntry>();
  for (const entry of entries) unique.set(`${entry.seqStart}:${entry.seqEnd}`, entry);
  return { agent, entries: [...unique.values()].sort((a, b) => a.seqStart - b.seqStart) };
}
