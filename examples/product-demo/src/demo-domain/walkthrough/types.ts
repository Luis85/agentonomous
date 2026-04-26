/**
 * Walkthrough domain contracts (Pillar 1, slice 1.1).
 *
 * Pure-TS types consumed by `graph.ts` and `predicates.ts`. Downstream
 * Pinia view stores (slice 1.2+) project these into `useTourProgress`
 * and the overlay component.
 *
 * The `__brand` markers prevent accidental cross-domain string mixing
 * (a raw component selector is not a `SelectorHandle`; a route slug is
 * not a `WalkthroughStepId`). Construct via the helpers below — tests
 * stay readable and runtime cost is zero.
 */

/** A unique step id, narrowed via brand to prevent string mix-ups. */
export type WalkthroughStepId = string & { readonly __brand: 'WalkthroughStepId' };

/**
 * A logical UI handle resolved by the per-component selector registry
 * introduced in slice 1.3. Markup changes that drop a registered handle
 * MUST surface as a `tsc` error, not a runtime crash (spec P1-FR-4).
 */
export type SelectorHandle = string & { readonly __brand: 'SelectorHandle' };

/** The five comprehension chapters fixed by spec P1-FR-2. */
export type ChapterId = 1 | 2 | 3 | 4 | 5;

/**
 * Read-only projection of `useAgentSession` consumed by completion
 * predicates. Domain module owns this contract so downstream pillars
 * cannot import the live store from inside `demo-domain/`.
 */
export type AgentSessionSnapshot = {
  readonly tickIndex: number;
  readonly cognitionModeId: string;
  readonly seed: number;
  readonly recentEvents: ReadonlyArray<SessionEvent>;
};

/**
 * Minimal event projection used by predicates. Type id is a free string
 * so individual pillar slices can extend without coupling back here.
 */
export type SessionEvent = {
  readonly type: string;
  readonly tickIndex: number;
};

/** Read-only projection of router state consumed by completion predicates. */
export type RouteContext = {
  readonly path: string;
  readonly scenarioId: string | null;
  readonly tourStep: WalkthroughStepId | null;
};

/** Bundled context handed to every predicate evaluation. */
export type TourCtx = {
  readonly session: AgentSessionSnapshot;
  readonly route: RouteContext;
};

/** A predicate observes the current `TourCtx` and returns true once satisfied. */
export type CompletionPredicate = (ctx: TourCtx) => boolean;

/** Sentinel returned by `nextOnComplete` for the final step of the tour. */
export const TOUR_END = 'end' as const;
export type TourEnd = typeof TOUR_END;

/** Definition of one step in the walkthrough graph. */
export type WalkthroughStep = {
  readonly id: WalkthroughStepId;
  readonly chapter: ChapterId;
  readonly title: string;
  readonly hint: string;
  readonly highlight: SelectorHandle;
  readonly completionPredicate: CompletionPredicate;
  readonly nextOnComplete: WalkthroughStepId | TourEnd;
};

/** Construct a `WalkthroughStepId` from a literal. Compile-time-only cast. */
export function walkthroughStepId(raw: string): WalkthroughStepId {
  return raw as WalkthroughStepId;
}

/** Construct a `SelectorHandle` from a literal. Compile-time-only cast. */
export function selectorHandle(raw: string): SelectorHandle {
  return raw as SelectorHandle;
}
