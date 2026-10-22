import type { PluginClientContext, PluginButtonRegistration, PluginButtonContentProps } from "@getpaseo/plugin/client";
import { ExportPanel, ExportPopover } from "./client/export-panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({ id: "export", title: "Export conversation", icon: "FileDown", context: "agent", Component: ExportPanel });
  client.addCommandCenterItem({
    id: "export-session", title: "Export conversation as Markdown or JSON", icon: "FileDown",
    keywords: ["session", "history", "markdown", "download"], context: "agent",
    onSelect: ({ openPanel }) => openPanel("export"),
  });
  client.addSlashCommand({ name: "export", description: "Export this conversation as Markdown or JSON", argumentHint: "", context: "agent", onSubmit: ({ openPanel }) => openPanel("export") });
  const pills = new Map<string, PluginButtonRegistration>();
  const placements = new Map<string, string>();
  const lifetime = new AbortController();
  const clear = () => { for (const pill of pills.values()) pill.remove(); pills.clear(); placements.clear(); };
  const register = (agent: { id: string; workspaceId?: string | null }) => {
    if (lifetime.signal.aborted) return;
    if (placements.get(agent.id) === agent.workspaceId && pills.has(agent.id)) return;
    pills.get(agent.id)?.remove();
    pills.delete(agent.id);
    placements.delete(agent.id);
    if (!agent.workspaceId) return;
    const { id: agentId, workspaceId } = agent;
    placements.set(agentId, workspaceId);
    function Popover(props: PluginButtonContentProps) {
      return <ExportPopover {...props} onOpenPreview={() => {
        props.close();
        client.openPanel("export", { workspaceId, agentId });
      }} />;
    }
    pills.set(agentId, client.addComposerPill({
      id: "export", agentId, workspaceId,
      button: { title: "Export conversation", label: "Export", icon: "FileDown", behavior: {
        kind: "popover", Content: Popover,
      } },
    }));
  };
  void client.paseo.agents.list({ subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    if (lifetime.signal.aborted) { void subscription.release(); return; }
    subscription.subscribe({
      snapshot: ({ entries }) => {
        const ids = new Set(entries.map(({ agent }) => agent.id));
        for (const [id, pill] of pills) if (!ids.has(id)) { pill.remove(); pills.delete(id); placements.delete(id); }
        for (const { agent } of entries) register(agent);
      },
      update: (message) => {
        if (message.type !== "agent_update") return;
        const update = message.payload;
        if (update.kind === "upsert") register(update.agent);
        else { pills.get(update.agentId)?.remove(); pills.delete(update.agentId); placements.delete(update.agentId); }
      },
    });
  }).catch((error) => { if (!lifetime.signal.aborted) console.error("Exporter agent observation failed", error); });
  return () => { lifetime.abort(); clear(); };
}
