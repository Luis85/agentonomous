/**
 * Policy that controls when the Agent automatically takes a snapshot + writes
 * it to its `SnapshotStorePort`. Evaluated at the end of each tick.
 *
 * Default (when a consumer enables persistence without specifying policy):
 * `{ everyTicks: 5, onEvents: ['AgentDied', 'LifeStageChanged'] }`.
 *
 * Set `enabled: false` to disable auto-save entirely — consumers can still
 * call `agent.snapshot()` manually.
 */
export type AutoSavePolicy = {
  enabled?: boolean;
  /** Save every N ticks. Set to 0 or omit to disable tick-based saves. */
  everyTicks?: number;
  /** Save every N virtual seconds. */
  everyVirtualSeconds?: number;
  /** Save when any of these event types are published. */
  onEvents?: readonly string[];
};

/** Default auto-save policy when consumers opt into persistence without specifying one. */
export const DEFAULT_AUTOSAVE_POLICY: Readonly<Required<Omit<AutoSavePolicy, 'enabled'>>> & {
  enabled: true;
} = {
  enabled: true,
  everyTicks: 5,
  everyVirtualSeconds: 0,
  onEvents: ['AgentDied', 'LifeStageChanged'],
};

function isPositiveFiniteNumber(n: number | undefined): n is number {
  return n !== undefined && Number.isFinite(n) && n > 0;
}

/**
 * Stateful auto-save tracker. Agent owns one of these and asks `.shouldSave()`
 * each tick after running the pipeline.
 */
export class AutoSaveTracker {
  private readonly policy: AutoSavePolicy;
  private ticksSinceSave = 0;
  private virtualSecondsSinceSave = 0;
  private eventTriggeredThisTick = false;

  constructor(policy: AutoSavePolicy = DEFAULT_AUTOSAVE_POLICY) {
    this.policy = policy;
  }

  /** Record a tick's worth of virtual seconds. */
  advance(virtualDtSeconds: number): void {
    this.ticksSinceSave += 1;
    this.virtualSecondsSinceSave += virtualDtSeconds;
  }

  /** Record that an event that might trigger auto-save was published. */
  observeEvent(eventType: string): void {
    if (this.policy.onEvents?.includes(eventType)) {
      this.eventTriggeredThisTick = true;
    }
  }

  /** Query: should the agent persist now? Call at end of tick; resets on true. */
  shouldSave(): boolean {
    if (this.policy.enabled === false) return false;
    if (this.eventTriggeredThisTick) return true;
    if (
      isPositiveFiniteNumber(this.policy.everyTicks) &&
      this.ticksSinceSave >= this.policy.everyTicks
    ) {
      return true;
    }
    if (
      isPositiveFiniteNumber(this.policy.everyVirtualSeconds) &&
      this.virtualSecondsSinceSave >= this.policy.everyVirtualSeconds
    ) {
      return true;
    }
    return false;
  }

  /** Reset counters after a save has been committed. */
  markSaved(): void {
    this.ticksSinceSave = 0;
    this.virtualSecondsSinceSave = 0;
    this.eventTriggeredThisTick = false;
  }
}
