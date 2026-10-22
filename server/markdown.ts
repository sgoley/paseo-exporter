import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { ExportOptions } from "../shared/export";
import type { HistoryEntry } from "./history";

export function inline(text: string) {
  return text.replace(/\r?\n/g, " ").replace(/[\\`*_{}\[\]<>()#!|~]/g, "\\$&");
}
export function fence(value: unknown, language = "json") {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null";
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const delimiter = "`".repeat(longest + 1);
  return `${delimiter}${language}\n${text}\n${delimiter}`;
}
function details(title: string, content: string) {
  return `<details>\n<summary>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</summary>\n\n${content}\n\n</details>`;
}
function renderItem(item: AgentTimelineItem, options: ExportOptions): { role: string; body: string } | null {
  switch (item.type) {
    case "user_message": return { role: "User", body: item.text };
    case "assistant_message": return { role: "Assistant", body: item.text };
    case "reasoning": return options.includeReasoning ? { role: "Reasoning", body: details("Reasoning", item.text) } : null;
    case "tool_call": {
      if (!options.includeTools) return null;
      const { type, callId, name, status, detail, error, ...extra } = item;
      return { role: `Tool: ${inline(name)}`, body: details(`${name} · ${status}`, [
        `**Call ID:** ${inline(callId)}`,
        fence(detail),
        ...(error != null ? [`**Error**\n\n${fence(error)}`] : []),
        ...(Object.keys(extra).length ? [`**Additional data**\n\n${fence(extra)}`] : []),
      ].join("\n\n")) };
    }
    case "todo": return { role: "Tasks", body: item.items.map((task) => `- [${task.completed || task.status === "completed" ? "x" : " "}] ${inline(task.text)}${task.status === "in_progress" ? " (in progress)" : ""}`).join("\n") };
    case "error": return { role: "Error", body: item.message };
    case "notification": return { role: `Notice (${item.level})`, body: item.message };
    case "compaction": return { role: "Context compaction", body: fence(item) };
    case "plugin": return { role: `Plugin: ${inline(item.pluginId)}`, body: details(`${item.kind} (v${item.version})`, fence(item.data)) };
    default: return { role: "Event", body: fence(item) };
  }
}
export interface SessionMetadata {
  id: string; title: string | null; provider: string; model: string | null;
  reasoningEffort?: string | null; thinkingOptionId?: string | null; effectiveThinkingOptionId?: string | null;
  configuredProvider?: string; configuredModel?: string | null;
  cwd: string; createdAt: string; status: string;
}
export function renderMarkdown(agent: SessionMetadata, entries: HistoryEntry[], options: ExportOptions, exportedAt: string) {
  const rendered = entries.flatMap((entry) => {
    const row = renderItem(entry.item, options);
    return row ? [{ ...row, timestamp: entry.timestamp }] : [];
  });
  const header = [
    `# ${inline(agent.title || "Paseo conversation")}`,
    "",
    "| Session | Value |", "| --- | --- |",
    ...Object.entries({ "Agent ID": agent.id, Provider: agent.provider, Model: agent.model ?? "Not reported", "Reasoning effort": agent.reasoningEffort ?? "Not reported", "Configured provider": agent.configuredProvider ?? agent.provider, "Configured model": agent.configuredModel ?? agent.model ?? "Not reported", "Configured effort": agent.thinkingOptionId ?? "Default / not reported", Directory: agent.cwd, Created: agent.createdAt, Exported: exportedAt, Status: agent.status, "History entries": String(entries.length) })
      .map(([key, value]) => `| ${key} | ${inline(value)} |`),
    "",
    "> Snapshot of the history available from Paseo at export time. Active turns may be incomplete; content removed by provider retention or compaction cannot be recovered. Attachments are represented only as exposed in the timeline.",
    "",
    "Provider, model, and reasoning effort describe the session at export time. Historical model and effort changes are not exposed per message by Paseo.",
    "",
    `Export options: reasoning ${options.includeReasoning ? "included" : "omitted"}; tools ${options.includeTools ? "included" : "omitted"}; timestamps ${options.includeTimestamps ? "included" : "omitted"}.`,
  ].join("\n");
  return `${header}\n\n${rendered.length ? rendered.map((row, index) => [
    "---", `## ${index + 1}. ${row.role}`,
    ...(options.includeTimestamps ? [`*${inline(row.timestamp)}*`] : []), row.body,
  ].join("\n\n")).join("\n\n") : "_No conversation entries to export._"}\n`;
}
export function exportFilename(title: string | null, agentId: string, date: string) {
  const slug = (title || "conversation").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "conversation";
  const id = agentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36) || "session";
  return `${slug}-${id}-${date.replace(/[^0-9]/g, "")}.md`;
}
