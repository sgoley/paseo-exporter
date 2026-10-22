import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { exportFormat, exportOptions } from "./export";

export const defaultsSchema = z.object({
  format: exportFormat,
  destination: z.enum(["exports", "session", "custom", "clipboard"]),
  directory: z.string().trim().max(4096),
  options: exportOptions,
}).refine((value) => value.destination !== "custom" || /^(~\/|\/|[A-Za-z]:[\\/]|\\\\)/.test(value.directory), {
  message: "Custom folders must be absolute paths or start with ~/.", path: ["directory"],
});
export type ExportDefaults = z.infer<typeof defaultsSchema>;
export const factoryDefaults: ExportDefaults = {
  format: "markdown", destination: "exports", directory: "",
  options: { includeReasoning: true, includeTools: true, includeTimestamps: true },
};
export const preferences = defineSettings({
  id: "export-defaults", scope: "host", version: 1,
  schema: z.object({
    defaults: defaultsSchema.default(factoryDefaults),
    workspaces: z.record(z.string(), defaultsSchema).default({}),
  }),
});
export type Preferences = z.infer<typeof preferences.schema>;
export function resolveDefaults(values: Preferences, workspaceId: string): ExportDefaults {
  return values.workspaces[workspaceId] ?? values.defaults;
}
