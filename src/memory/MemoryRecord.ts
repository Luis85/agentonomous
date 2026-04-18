/**
 * An individual memory entry. Markdown-style structure (body as prose) with
 * frontmatter-ish metadata on top.
 *
 * Three memory kinds:
 * - `'semantic'`  — durable facts and rules.
 * - `'episodic'`  — specific past events ("the player scolded me at t=…").
 * - `'working'`   — short-term context, ephemeral.
 *
 * Consumer-defined kinds are allowed via the escape hatch.
 */
export type MemoryKind = 'semantic' | 'episodic' | 'working' | (string & {});

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  agentId: string;
  /** Wall-clock ms when the record was saved. */
  createdAt: number;
  /** 0..1 — how important this memory is. Used for retrieval ranking. */
  importance: number;
  /** 0..1 — how confident the agent is in the memory's accuracy. */
  confidence: number;
  /** Free-form tags for filtering (e.g., ['trade', 'supplier-bob']). */
  topics: readonly string[];
  /** Markdown body. */
  body: string;
}
