import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchHistory, type HistoryEntry, type HistoryPage } from "../server/history";
import { renderMarkdown, exportFilename, fence } from "../server/markdown";
import { createExport, saveSession, destinationDirectory } from "../server/export";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

const metadata = { id: "agent-1", title: "A | session", provider: "codex", model: "model", cwd: "/tmp/project", createdAt: "2026-10-22T00:00:00Z", status: "idle" };
const options = { includeReasoning: true, includeTools: true, includeTimestamps: true };
function entry(seq: number, item: HistoryEntry["item"]): HistoryEntry {
  return { item, provider: "codex", timestamp: "2026-10-22T00:00:00Z", seqStart: seq, seqEnd: seq, sourceSeqRanges: [{ startSeq: seq, endSeq: seq }], collapsed: [] };
}
function page(entries: HistoryEntry[], older = false, extra: Partial<HistoryPage> = {}): HistoryPage {
  return { agent: metadata, entries, epoch: "epoch", hasOlder: older, hasNewer: false, reset: false, gap: false, staleCursor: false, error: null,
    startCursor: entries.length ? { epoch: "epoch", seq: entries[0].seqStart } : null,
    endCursor: entries.length ? { epoch: "epoch", seq: entries.at(-1)!.seqEnd } : null,
    direction: "tail", projection: "projected", window: { minSeq: 1, maxSeq: 10, nextSeq: 11 }, agentId: metadata.id, requestId: "test", ...extra } as HistoryPage;
}
const user = entry(1, { type: "user_message", text: "**Keep Markdown**\n\n```ts\nconst x = 1;\n```" });
const answer = entry(2, { type: "assistant_message", text: "# Answer\n\n- item" });

test("walks every page backwards, sorts chronologically, removes boundary overlap", async () => {
  const calls: unknown[] = [];
  const pages = [page([answer], true), page([user, answer])];
  const result = await fetchHistory({ refetch: async (args) => { calls.push(args); return pages.shift()!; } });
  assert.deepEqual(result.entries, [user, answer]);
  assert.deepEqual(calls, [ { direction: "tail", limit: 200, projection: "projected" }, { direction: "before", cursor: { epoch: "epoch", seq: 2 }, limit: 200, projection: "projected" } ]);
});
test("rejects missing sessions and incomplete, stale, reset, or stalled histories", async () => {
  for (const extra of [{ gap: true }, { staleCursor: true }, { error: "Provider failed" }, { agent: null }]) {
    await assert.rejects(fetchHistory({ refetch: async () => page([], false, extra) }));
  }
  for (const extra of [{ epoch: "changed" }, { reset: true }, {}]) {
    const pages = [page([answer], true), page([answer], true, extra)];
    await assert.rejects(fetchHistory({ refetch: async () => pages.shift()! }));
  }
});
test("preserves message Markdown and exports every timeline variant", () => {
  const entries = [user, answer,
    entry(3, { type: "reasoning", text: "A thought" }),
    entry(4, { type: "tool_call", callId: "call", name: "shell <test>", status: "failed", error: { message: "bad" }, detail: { type: "shell", command: "echo test", output: "```\n</details>", exitCode: 1 } } as HistoryEntry["item"]),
    entry(5, { type: "todo", items: [{ text: "done", completed: true }, { text: "work", completed: false, status: "in_progress" }] }),
    entry(6, { type: "error", message: "Failed" }), entry(7, { type: "notification", level: "warning", message: "Notice" }),
    entry(8, { type: "compaction", status: "completed", preTokens: 400 }),
    entry(9, { type: "plugin", id: "id", pluginId: "plugin", kind: "card", version: 1, data: { text: "plugin data" } }),
  ];
  const markdown = renderMarkdown(metadata, entries, options, "now");
  for (const text of ["**Keep Markdown**", "# Answer", "A thought", "shell &lt;test&gt;", "**Error**", "- [x] done", "(in progress)", "## 6. Error", "Notice", "Context compaction", "plugin data", "A \\| session", "2026-10-22T00:00:00Z"]) assert.ok(markdown.includes(text as string), String(text));
  const filtered = renderMarkdown(metadata, entries, { includeTools: false, includeReasoning: false, includeTimestamps: false }, "now");
  assert.ok(!filtered.includes("A thought")); assert.ok(!filtered.includes("Call ID"));
  assert.ok(!filtered.includes("*2026-10-22T00:00:00Z*"));
});
test("fences cannot be closed by embedded backticks and filenames cannot escape the export directory", () => {
  assert.equal(fence("```\ncontent\n````", "text"), "`````text\n```\ncontent\n````\n`````");
  const filename = exportFilename("../../CON / test", "../bad/id", "2026-10-22T12:12:12.123Z");
  assert.match(filename, /^[a-zA-Z0-9_-]+\.md$/);
  assert.ok(!filename.includes(".."));
});
test("RPC generation returns complete content and reports provider errors", async () => {
  const context = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => page([user, answer]) } }) } } } as unknown as PluginHandlerContext;
  const result = await createExport({ agentId: "agent-1", options, format: "markdown" }, context);
  assert.equal(result.entryCount, 2); assert.ok(result.content.includes("# Answer")); assert.ok(result.filename.endsWith(".md"));
});

test("JSON keeps structured entries and honors reasoning, tool, and timestamp filters", async () => {
  const entries = [user, answer, entry(3, { type: "reasoning", text: "thought" }), entry(4, { type: "tool_call", callId: "c", name: "tool", status: "completed", error: null, detail: { type: "unknown", input: { x: 1 }, output: { y: 2 } } })];
  const context = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => page(entries) } }) } } } as unknown as PluginHandlerContext;
  const full = await createExport({ agentId: "agent-1", options, format: "json" }, context);
  const parsed = JSON.parse(full.content);
  assert.equal(parsed.schemaVersion, 1); assert.equal(parsed.entries.length, 4); assert.equal(parsed.entries[3].item.detail.output.y, 2);
  const filtered = await createExport({ agentId: "agent-1", options: { includeReasoning: false, includeTools: false, includeTimestamps: false }, format: "json" }, context);
  assert.equal(filtered.entryCount, 2); assert.equal(JSON.parse(filtered.content).entries[0].timestamp, undefined);
});
test("host and session destinations resolve explicitly, relative custom paths fail", () => {
  assert.equal(destinationDirectory("exports", undefined, "/work", "/home/test"), "/home/test/Paseo Exports");
  assert.equal(destinationDirectory("session", undefined, "/work", "/home/test"), "/work/Paseo Exports");
  assert.equal(destinationDirectory("custom", "~/notes", "/work", "/home/test"), "/home/test/notes");
  assert.throws(() => destinationDirectory("custom", "notes", "/work"), /absolute/);
});
test("saves both formats without overwriting and reports file permission errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-exporter-test-"));
  const context = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => page([user, answer]) } }) } } } as unknown as PluginHandlerContext;
  try {
    const input = { agentId: "agent-1", options, format: "markdown" as const, destination: "custom" as const, directory };
    const first = await saveSession(input, context);
    const second = await saveSession(input, context);
    assert.notEqual(first.path, second.path); assert.ok((await readFile(first.path, "utf8")).includes("# Answer"));
    assert.equal((await stat(first.path)).mode & 0o777, 0o600);
    const json = await saveSession({ ...input, format: "json" }, context);
    assert.equal(JSON.parse(await readFile(json.path, "utf8")).entries.length, 2);
    await assert.rejects(saveSession({ ...input, directory: first.path }, context));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("both formats capture effective provider, runtime model, and reasoning effort independently of reasoning content", async () => {
  const agent = { ...metadata, provider: "configured-provider", model: "configured-model", thinkingOptionId: "low", effectiveThinkingOptionId: "high", runtimeInfo: { provider: "codex", model: "runtime-model", thinkingOptionId: "medium", sessionId: "provider-session" } };
  const context = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => page([user, answer], false, { agent } as Partial<HistoryPage>) } }) } } } as unknown as PluginHandlerContext;
  const input = { agentId: "agent-1", options: { ...options, includeReasoning: false } };
  const json = JSON.parse((await createExport({ ...input, format: "json" }, context)).content);
  assert.equal(json.session.provider, "codex");
  assert.equal(json.session.model, "runtime-model");
  assert.equal(json.session.reasoningEffort, "high");
  assert.equal(json.session.thinkingOptionId, "low");
  assert.equal(json.session.effectiveThinkingOptionId, "high");
  assert.equal(json.session.configuredModel, "configured-model");
  const markdown = (await createExport({ ...input, format: "markdown" }, context)).content;
  for (const row of ["| Provider | codex |", "| Model | runtime-model |", "| Reasoning effort | high |", "| Configured effort | low |", "| Configured model | configured-model |"]) assert.ok(markdown.includes(row), row);
});
test("effort falls back to runtime, then configuration, and stays unknown when unreported", async () => {
  for (const [fields, expected] of [
    [{ runtimeInfo: { provider: "codex", sessionId: null, thinkingOptionId: "medium" }, thinkingOptionId: "low" }, "medium"],
    [{ thinkingOptionId: "low" }, "low"],
    [{}, null],
  ] as const) {
    const context = { paseo: { agents: { ref: () => ({ timeline: { refetch: async () => page([user], false, { agent: { ...metadata, ...fields } } as Partial<HistoryPage>) } }) } } } as unknown as PluginHandlerContext;
    const json = JSON.parse((await createExport({ agentId: "agent-1", options, format: "json" }, context)).content);
    assert.equal(json.session.reasoningEffort, expected);
  }
});
