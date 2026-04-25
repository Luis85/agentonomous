import type { Appearance } from '../body/Appearance.js';
import type { LocomotionMode } from '../body/LocomotionMode.js';
import type { LifecycleDescriptor } from '../lifecycle/defineLifecycle.js';
import type { Modifier } from '../modifiers/Modifier.js';
import type { Need } from '../needs/Need.js';
import type { Persona } from '../agent/Persona.js';

/**
 * A data-driven bundle describing everything that makes a given species
 * different from another: its needs catalog, lifecycle schedule, passive
 * modifiers, default persona traits, default appearance, and locomotion.
 *
 * Core stays species-agnostic — the library ships this as a **shape**, not
 * a pre-populated catalog. Consumers compose `defineSpecies({ id: 'cat',
 * … })` or load JSON (matching `species.schema.json`) and feed the
 * descriptor to `createAgent({ species: catDescriptor })`.
 */
export type SpeciesDescriptor = {
  /** Stable identifier (used as `AgentIdentity.species`). */
  id: string;
  /** Human-readable label for UI. Defaults to `id`. */
  displayName?: string;
  /** Default persona traits for agents of this species. */
  persona?: Persona;
  /** Default needs catalog (hunger, thirst, etc.). */
  needs?: readonly Need[];
  /** Lifecycle / aging schedule + stage capabilities. */
  lifecycle?: LifecycleDescriptor;
  /** Passive modifiers applied at agent construction time. */
  passiveModifiers?: readonly Modifier[];
  /** Default appearance template. */
  appearance?: Appearance;
  /** Default locomotion mode. */
  locomotion?: LocomotionMode;
  /**
   * Whether agents of this species can engage in dialogue. Reserved for a
   * future dialogue / LLM tool extension; currently informational — the
   * core library does not gate any behavior on this flag.
   */
  dialogueCapable?: boolean;
  /**
   * If non-empty, only these skill ids are permitted at runtime across all
   * life stages. Consumers can still add per-stage overrides via
   * `lifecycle.capabilities`.
   */
  allowedSkills?: readonly string[];
  /** Free-form tags for UI filtering (e.g., `['mammal', 'feline']`). */
  tags?: readonly string[];
  /** Schema version for migrations. Defaults to 1. */
  version?: number;
};
