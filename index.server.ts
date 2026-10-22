import type { PluginServerContext } from "@getpaseo/plugin/server";
import { exportSession, saveExport } from "./shared/export";
import { createExport, saveSession } from "./server/export";

export default function contribute(server: PluginServerContext) {
  server.handle(exportSession, createExport);
  server.handle(saveExport, saveSession);
  return () => {};
}
