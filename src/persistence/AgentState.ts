/**
 * Cheap, frame-safe state slice surfaced by `Agent.getState()`.
 *
 * Consumers subscribe to the event bus via `agent.subscribe(...)` and call
 * `agent.getState()` in the handler to project into a reactive store
 * (Pinia, Zustand, Redux, Svelte stores, signals). See the plan's
 * Persistence + reactive store section.
 *
 * Shape grows milestone-by-milestone:
 *   - M2 (now): id, stage, halted, ageSeconds, needs (empty), modifiers
 *     (empty), mood (undefined), animation ('idle').
 *   - M3 populates `needs`.
 *   - M4 populates `modifiers`.
 *   - M5 populates `mood` + real `stage`.
 *   - M8 populates `animation`.
 */
export interface AgentState {
  id: string;
  stage: string;
  halted: boolean;
  ageSeconds: number;
  needs: Readonly<Record<string, number>>;
  modifiers: readonly { id: string; expiresAt?: number }[];
  mood?: { category: string; updatedAt: number };
  animation: string;
}
