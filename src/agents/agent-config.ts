/**
 * Agent tuning. Model and provider selection deliberately live in
 * `@/lib/ai/config`, not here — the agent must not know which provider serves it.
 */
export const agentConfig = {
  maxMemoryResults: 8,
  maxRetrievedDocuments: 6,
  /** Prior turns replayed to the model. Bounds prompt growth on long threads. */
  maxHistoryMessages: 20,
};
