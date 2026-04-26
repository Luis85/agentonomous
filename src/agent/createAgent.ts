import type { EventBusPort } from '../events/EventBusPort.js';
import type {
  AnimationStateMachine,
  AnimationStateMachineOptions,
} from '../animation/AnimationStateMachine.js';
import type { Embodiment } from '../body/Embodiment.js';
import type { BehaviorRunner } from '../cognition/behavior/BehaviorRunner.js';
import type { Learner } from '../cognition/learning/Learner.js';
import type { Reasoner } from '../cognition/reasoning/Reasoner.js';
import type { LifecycleDescriptor } from '../lifecycle/defineLifecycle.js';
import type { LifeStage } from '../lifecycle/LifeStage.js';
import type { LifeStageSchedule } from '../lifecycle/LifeStageSchedule.js';
import type { MemoryRepository } from '../memory/MemoryRepository.js';
import type { Modifiers } from '../modifiers/Modifiers.js';
import type { MoodModel } from '../mood/MoodModel.js';
import type { Need } from '../needs/Need.js';
import type { Needs } from '../needs/Needs.js';
import type { NeedsPolicy } from '../needs/NeedsPolicy.js';
import type { Skill } from '../skills/Skill.js';
import type { SkillRegistry } from '../skills/SkillRegistry.js';
import type { AutoSavePolicy } from '../persistence/AutoSavePolicy.js';
import type { SnapshotStorePort } from '../persistence/SnapshotStorePort.js';
import type { RandomEventTicker } from '../randomEvents/RandomEventTicker.js';
import type { RandomEventDef } from '../randomEvents/defineRandomEvent.js';
import type { RemoteController } from './RemoteController.js';
import type { ScriptedController } from './ScriptedController.js';
import type { WallClock } from '../ports/WallClock.js';
import type { Rng } from '../ports/Rng.js';
import type { Logger } from '../ports/Logger.js';
import type { Validator } from '../ports/Validator.js';
import type { SpeciesDescriptor } from '../species/SpeciesDescriptor.js';
import type { SpeciesRegistry } from '../species/SpeciesRegistry.js';
import type { Species } from './Species.js';
import type { AgentRole } from './AgentRole.js';
import type { Persona } from './Persona.js';
import type { AgentModule } from './AgentModule.js';
import type { ControlMode } from './ControlMode.js';
import { Agent } from './Agent.js';
import {
  buildAgentDeps,
  installModuleSkills,
  toAgentDependencies,
  type ResolvedDeps,
} from './internal/buildAgentDeps.js';

/**
 * Ergonomic builder config for `createAgent`. Only `id` + `species` are
 * required; every other slot has a sensible Phase A default so a consumer
 * can get a running agent in a one-liner.
 */
export type CreateAgentConfig = {
  /** Stable unique identifier. */
  id: string;
  /**
   * Species. Accepts a bare id string (resolved via `speciesRegistry` when
   * one is wired), a full `SpeciesDescriptor` (from `defineSpecies()`), or
   * both a registry + id.
   */
  species: Species | SpeciesDescriptor;
  /** Optional registry consulted when `species` is passed as a string. */
  speciesRegistry?: SpeciesRegistry;

  /** Human-readable name. Defaults to `id` if omitted. */
  name?: string;
  /** Version tag stored on the identity. Defaults to `'0.0.0'`. */
  version?: string;
  /** Role in the simulation. Defaults to `'npc'`. */
  role?: AgentRole;
  /** Optional persona traits. */
  persona?: Persona;
  /** Time scale multiplier. Defaults to 1. */
  timeScale?: number;
  /** Initial control mode. Defaults to `'autonomous'`. */
  controlMode?: ControlMode;

  /** Override the event bus. Defaults to a fresh `InMemoryEventBus`. */
  eventBus?: EventBusPort;
  /** Override the wall clock. Defaults to `SystemClock`. */
  clock?: WallClock;
  /**
   * RNG override, or a seed. Passing a number/string constructs a
   * `SeededRng` with that seed. Omitting it seeds with `id` for stability.
   */
  rng?: Rng | number | string;
  /** Logger. Omitted → `NullLogger` (silent). */
  logger?: Logger;
  /** Optional validator for skill/tool inputs (opt-in). */
  validator?: Validator;
  /** Plugins to install at construction time. */
  modules?: readonly AgentModule[];
  /** Homeostatic needs. Pass a `Needs` instance or a list of `Need` definitions. */
  needs?: Needs | readonly Need[];
  /** Pre-populated `Modifiers` collection. Usually left to default (empty). */
  modifiers?: Modifiers;
  /**
   * Lifecycle descriptor — either a `LifecycleDescriptor` from
   * `defineLifecycle()` or a bare schedule. Without this the agent never
   * ages or transitions life stages.
   */
  lifecycle?: LifecycleDescriptor | LifeStageSchedule;
  /** Initial virtual age in seconds. Defaults to 0. */
  initialAgeSeconds?: number;
  /** Initial life stage. Defaults to the first schedule entry. */
  initialStage?: LifeStage;
  /** Wall-clock ms when the agent was born. Defaults to `clock.now()`. */
  bornAt?: number;
  /** Override the mood model. Omit to get `DefaultMoodModel` (auto-enabled when lifecycle or needs exist). */
  moodModel?: MoodModel | false;
  /** Optional embodiment (transform + appearance + locomotion). */
  embodiment?: Embodiment;
  /** Random event ticker or a list of definitions to register. */
  randomEvents?: RandomEventTicker | readonly RandomEventDef[];
  /** Memory store. Defaults to an `InMemoryMemoryAdapter` when omitted. */
  memory?: MemoryRepository;
  /** Remote controller (for `controlMode: 'remote'`). */
  remote?: RemoteController;
  /** Scripted controller (for `controlMode: 'scripted'`). */
  scripted?: ScriptedController;
  /** Override the reasoner. Defaults to `UrgencyReasoner`. */
  reasoner?: Reasoner;
  /** Override the behavior runner. Defaults to `DirectBehaviorRunner`. */
  behavior?: BehaviorRunner;
  /** Override the learner. Defaults to `NoopLearner`. */
  learner?: Learner;
  /**
   * Needs policy. When set together with `needs`, feeds needs-driven
   * intention candidates into the reasoner every tick.
   */
  needsPolicy?: NeedsPolicy;
  /** SkillRegistry instance OR a list of `Skill`s to register. */
  skills?: SkillRegistry | readonly Skill[];
  /** Animation state machine instance or its constructor options. */
  animation?: AnimationStateMachine | AnimationStateMachineOptions;
  /**
   * Persistence config. Pass `false` to disable auto-save entirely.
   * When omitted, `pickDefaultSnapshotStore()` auto-selects
   * `LocalStorageSnapshotStore` in the browser and `InMemorySnapshotStore`
   * in Node — the MVP product demo's "zero-config persistence" story.
   */
  persistence?:
    | false
    | {
        store?: SnapshotStorePort;
        autoSave?: AutoSavePolicy;
        autoSaveKey?: string;
      };
};

/**
 * Default ingress. Returns a running `Agent` with Phase A defaults wired in.
 *
 * ```ts
 * const pet = createAgent({ id: 'whiskers', species: 'cat' });
 * await pet.tick(0.016);
 * ```
 */
export function createAgent(config: CreateAgentConfig): Agent {
  const deps: ResolvedDeps = buildAgentDeps(config);
  installModuleSkills(deps.skills, config.modules);
  const agent = new Agent(toAgentDependencies(deps, config));
  applyPassiveModifiers(agent, deps.speciesDescriptor);
  return agent;
}

function applyPassiveModifiers(agent: Agent, sd: SpeciesDescriptor | undefined): void {
  if (!sd?.passiveModifiers) return;
  for (const mod of sd.passiveModifiers) {
    agent.applyModifier(mod);
  }
}
