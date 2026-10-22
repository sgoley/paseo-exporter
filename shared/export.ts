import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const exportOptions = z.object({
  includeReasoning: z.boolean().default(true),
  includeTools: z.boolean().default(true),
  includeTimestamps: z.boolean().default(true),
});
export type ExportOptions = z.infer<typeof exportOptions>;
export const exportFormat = z.enum(["markdown", "json"]);
export type ExportFormat = z.infer<typeof exportFormat>;
const exportInput = z.object({ agentId: z.string().min(1), options: exportOptions, format: exportFormat.default("markdown") });
export const exportSession = defineRpc({
  name: "session.export",
  input: exportInput,
  output: z.object({ content: z.string(), filename: z.string(), format: exportFormat, entryCount: z.number(), exportedAt: z.string() }),
});
export const saveExport = defineRpc({
  name: "session.save",
  input: exportInput.extend({
    destination: z.enum(["exports", "session", "custom"]).default("exports"),
    directory: z.string().trim().max(4096).optional(),
  }),
  output: z.object({ path: z.string(), entryCount: z.number() }),
});
