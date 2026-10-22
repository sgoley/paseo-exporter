import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { exportSession, saveExport } from "../shared/export";
import { sessionMetadata } from "./metadata";
import { fetchHistory } from "./history";
import { exportFilename, renderMarkdown } from "./markdown";

async function buildExport(input: RpcInput<typeof exportSession>, { paseo }: PluginHandlerContext) {
  const exportedAt = new Date().toISOString();
  const { agent, entries } = await fetchHistory(paseo.agents.ref(input.agentId).timeline);
  const session = sessionMetadata(agent);
  const selected = entries.filter(({ item }) => (input.options.includeReasoning || item.type !== "reasoning") && (input.options.includeTools || item.type !== "tool_call"));
  const content = input.format === "json" ? JSON.stringify({
    schemaVersion: 1, exportedAt, options: input.options,
    session,
    entries: selected.map(({ timestamp, ...entry }) => input.options.includeTimestamps ? { ...entry, timestamp } : entry),
  }, null, 2) + "\n" : renderMarkdown(session, entries, input.options, exportedAt);
  return {
    result: { content, filename: exportFilename(agent.title, agent.id, exportedAt).replace(/\.md$/, input.format === "json" ? ".json" : ".md"), format: input.format, entryCount: selected.length, exportedAt },
    cwd: agent.cwd,
  };
}
export async function createExport(input: RpcInput<typeof exportSession>, context: PluginHandlerContext) {
  return (await buildExport(input, context)).result;
}
export function destinationDirectory(destination: "exports" | "session" | "custom", directory: string | undefined, cwd: string, home = homedir()) {
  if (destination === "exports") return join(home, "Paseo Exports");
  if (destination === "session") return join(cwd, "Paseo Exports");
  const expanded = directory?.startsWith("~/") ? join(home, directory.slice(2)) : directory;
  if (!expanded || !isAbsolute(expanded)) throw new Error("Enter an absolute host folder path or a path beginning with ~/.");
  return resolve(expanded);
}
export async function saveSession(input: RpcInput<typeof saveExport>, context: PluginHandlerContext) {
  // Validate the destination before fetching a potentially large history.
  if (input.destination === "custom") destinationDirectory(input.destination, input.directory, "");
  const { result, cwd } = await buildExport(input, context);
  const directory = destinationDirectory(input.destination, input.directory, cwd);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, result.filename.replace(/\.(md|json)$/, `-${randomUUID().slice(0, 8)}.$1`));
  await writeFile(path, result.content, { flag: "wx", mode: 0o600 });
  return { path, entryCount: result.entryCount };
}
