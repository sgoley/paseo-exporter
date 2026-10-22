import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { type PluginAgentPanelProps, type PluginButtonContentProps, useAgent, useRpc } from "@getpaseo/plugin/client";
import { copyText, Markdown, TextInput } from "@getpaseo/plugin/client/ui";
import { exportSession, saveExport, type ExportOptions, type ExportFormat } from "../shared/export";

type Destination = "clipboard" | "exports" | "session" | "custom";
export function ExportPopover(props: PluginButtonContentProps & { onOpenPreview(): void }) {
  if (props.context !== "agent") return null;
  return <View style={{ width: props.layout.compact ? "100%" : 360 }}>
    <SessionExport key={`${props.host.id}:${props.agentId}`} {...props} context="agent" popover onOpenPreview={props.onOpenPreview} />
  </View>;
}
export function ExportPanel(props: PluginAgentPanelProps) {
  return <SessionExport key={`${props.host.id}:${props.agentId}`} {...props} />;
}
function SessionExport({ agentId, theme, layout, host, popover = false, onOpenPreview }: PluginAgentPanelProps & { popover?: boolean; onOpenPreview?: () => void }) {
  const agent = useAgent(agentId, (record) => ({ title: record.title }));
  const generate = useRpc(exportSession);
  const save = useRpc(saveExport);
  const [options, setOptions] = useState<ExportOptions>({ includeReasoning: true, includeTools: true, includeTimestamps: true });
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [destination, setDestination] = useState<Destination>("exports");
  const [directory, setDirectory] = useState("");
  const [raw, setRaw] = useState(false);
  const preview = useMutation({ mutationFn: () => generate({ agentId, options, format }) });
  const exporting = useMutation({ mutationFn: async () => {
    if (destination === "clipboard") {
      const result = await generate({ agentId, options, format });
      await copyText(result.content);
      return `Copied ${format === "markdown" ? "Markdown" : "JSON"} to this device’s clipboard (${result.entryCount} history entries).`;
    }
    const result = await save({ agentId, options, format, destination, ...(destination === "custom" ? { directory } : {}) });
    return `Saved ${result.entryCount} history entries to ${result.path}`;
  } });
  const busy = preview.isPending || exporting.isPending;
  const colors = theme.colors;
  const text = { color: colors.foreground };
  const reset = () => { preview.reset(); exporting.reset(); };
  function action(label: string, onPress: () => void, disabled = busy, primary = false) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: primary ? colors.accent : colors.surface1, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: primary ? colors.accentForeground : colors.foreground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>;
  }
  const content = <View style={{ padding: popover ? 0 : layout.compact ? 16 : 24, gap: 12 }}>
    <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: "600" }}>Export conversation</Text>
    <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 12 }}>{agent?.title || agentId}</Text>
    <Text style={{ ...text, fontSize: 12, fontWeight: "600" }}>Format</Text>
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
      {(["markdown", "json"] as const).map((value) => <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: format === value, disabled: busy }} onPress={() => { setFormat(value); reset(); }} style={{ flex: 1, padding: 9, borderRadius: 8, backgroundColor: format === value ? colors.accent : colors.surface1 }}>
        <Text style={{ color: format === value ? colors.accentForeground : colors.foreground, fontSize: 13, textAlign: "center", fontWeight: "600" }}>{value === "markdown" ? "Markdown" : "JSON"}</Text>
      </Pressable>)}
    </View>
    <Text style={{ ...text, fontSize: 12, fontWeight: "600" }}>Save to</Text>
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {([
        ["exports", "Host folder"], ["session", "Session folder"],
        ["custom", "Custom folder"], ["clipboard", "Clipboard"],
      ] as const).map(([value, label]) => <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: destination === value, disabled: busy }} onPress={() => { setDestination(value); exporting.reset(); }}
        style={{ width: "48%", paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.surface1, borderWidth: 1, borderColor: destination === value ? colors.accent : colors.surface1 }}>
        <Text style={{ ...text, fontSize: 13 }}>{destination === value ? "◉" : "○"} {label}</Text>
      </Pressable>)}
    </View>
    <Text numberOfLines={2} style={{ color: colors.foregroundMuted, fontSize: 12 }}>
      {destination === "exports" ? `~/Paseo Exports on ${host.label}` : destination === "session" ? `Paseo Exports in the session folder on ${host.label}` : destination === "custom" ? `Folder on ${host.label}` : "Copies to this device’s clipboard"}
    </Text>
    {destination === "custom" && <TextInput accessibilityLabel="Custom host folder path" value={directory} editable={!busy} onChangeText={(value) => { setDirectory(value); exporting.reset(); }} autoCapitalize="none" autoCorrect={false} placeholder="~/Documents/Conversation exports" placeholderTextColor={colors.foregroundMuted} style={{ ...text, backgroundColor: colors.surface1, borderRadius: 8, padding: 12 }} />}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {([
        ["includeReasoning", "Reasoning"], ["includeTools", "Tools"], ["includeTimestamps", "Timestamps"],
      ] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: options[key], disabled: busy }} disabled={busy}
        onPress={() => { setOptions({ ...options, [key]: !options[key] }); reset(); }} style={{ paddingVertical: 6 }}>
        <Text style={{ ...text, fontSize: 12 }}>{options[key] ? "☑" : "☐"} {label}</Text>
      </Pressable>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {action(exporting.isPending ? "Exporting…" : destination === "clipboard" ? "Copy export" : `Save .${format === "markdown" ? "md" : "json"}`, () => exporting.mutate(), busy || (destination === "custom" && !directory.trim()), true)}
      {popover ? action("Full panel ↗", () => onOpenPreview?.()) : action(preview.isPending ? "Loading…" : "Preview", () => preview.mutate())}
    </View>
    {(preview.error || exporting.error) && <Text accessibilityRole="alert" selectable style={text}>{(preview.error || exporting.error)?.message}</Text>}
    {exporting.data && <Text accessibilityLiveRegion="polite" selectable style={text}>{exporting.data}</Text>}
    {!popover && preview.data && <>
      <Text style={{ color: colors.foregroundMuted }}>{preview.data.entryCount} history entries · {preview.data.filename}</Text>
      {format === "markdown" && action(raw ? "Show formatted preview" : "Show Markdown source", () => setRaw(!raw), false)}
      {raw || format === "json" ? <Text selectable style={{ ...text, fontFamily: "monospace", fontSize: 13 }}>{preview.data.content}</Text> : <Markdown>{preview.data.content}</Markdown>}
    </>}
  </View>;
  // Paseo already owns scrolling for popovers and mobile sheets.
  // Only the standalone panel needs its own scroll container.
  return popover ? content : <ScrollView showsVerticalScrollIndicator persistentScrollbar style={{ flex: 1, backgroundColor: colors.surface0 }}>{content}</ScrollView>;
}
