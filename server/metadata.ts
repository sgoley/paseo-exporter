import type { HistoryPage } from "./history";

/** Export only relevant settings, preferring effective/runtime values over configuration. */
export function sessionMetadata(agent: NonNullable<HistoryPage["agent"]>) {
  return {
    id: agent.id,
    title: agent.title,
    provider: agent.runtimeInfo?.provider ?? agent.provider,
    model: agent.runtimeInfo?.model ?? agent.model,
    reasoningEffort: agent.effectiveThinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? agent.thinkingOptionId ?? null,
    configuredProvider: agent.provider,
    configuredModel: agent.model,
    thinkingOptionId: agent.thinkingOptionId ?? null,
    effectiveThinkingOptionId: agent.effectiveThinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? null,
    cwd: agent.cwd,
    createdAt: agent.createdAt,
    status: agent.status,
  };
}
