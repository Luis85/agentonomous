import { InMemoryEventBus } from '../events/InMemoryEventBus.js';
import type { EventBusPort } from '../events/EventBusPort.js';
import type {
  AnimationStateMachine,
  AnimationStateMachineOptions,
} from '../animation/AnimationStateMachine.js';
import type { Embodiment } from '../body/Embodiment.js';
import type { BehaviorRunner } from '../cognition/behavior/BehaviorRunner.js';
import type { Learner } from '../cognition/learning/Learner.js';
import type { Reasoner } from '../cognition/reasoning/Reasoner.js';
import { AgeModel } from '../lifecycle/AgeModel.js';
import type { LifecycleDescriptor } from '../lifecycle/defineLifecycle.js';
import type { LifeStage } from '../lifecycle/LifeStage.js';
import type { LifeStageSchedule } from '../lifecycle/LifeStageSchedule.js';
import { InMemoryMemoryAdapter } from '../memory/InMemoryMemoryAdapter.js';
import type { MemoryRepository } from '../memory/MemoryRepository.js';
import type { Modifiers } from '../modifiers/Modifiers.js';
import type { MoodModel } from '../mood/MoodModel.js';
import { DefaultMoodModel } from '../mood/DefaultMoodModel.js';
import type { Need } from '../needs/Need.js';
import { Needs } from '../needs/Needs.js';
import type { NeedsPolicy } from '../needs/NeedsPolicy.js';
import type { Skill } from '../skills/Skill.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import type { AutoSavePolicy } from '../persistence/AutoSavePolicy.js';
import { pickDefaultSnapshotStore } from '../persistence/pickDefaultSnapshotStore.js';
import type { SnapshotStorePort } from '../persistence/SnapshotStorePort.js';
import { RandomEventTicker } from '../randomEvents/RandomEventTicker.js';
import type { RandomEventDef } from '../randomEvents/defineRandomEvent.js';
import type { RemoteController } from './RemoteController.js';
import type { ScriptedController } from './ScriptedController.js';
import type { WallClock } from '../ports/WallClock.js';
import { SystemClock } from '../ports/SystemClock.js';
import type { Rng } from '../ports/Rng.js';
import { SeededRng } from '../ports/SeededRng.js';
import type { Logger } from '../ports/Logger.js';
import type { Validator } from '../ports/Validator.js';
import type { SpeciesDescriptor } from '../species/SpeciesDescriptor.js';
import type { SpeciesRegistry } from '../species/SpeciesRegistry.js';
import { InvalidSpeciesError } from './errors.js';
import type { Species } from './Species.js';
import type { AgentRole } from './AgentRole.js';
import type { Persona } from './Persona.js';
import type { AgentIdentity } from './AgentIdentity.js';
import type { AgentModule } from './AgentModule.js';
import type { ControlMode } from './ControlMode.js';
import { Agent } from './Agent.js';

/**
 * Ergonomic builder config for `createAgent`. Only `id` + `species` are
 * required; every other slot has a sensible Phase A default so a consumer
 * can get a running agent in a one-liner.
 */
export interface CreateAgentConfig {
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
   * in Node — the MVP nurture-pet demo's "zero-config persistence" story.
   */
  persistence?:
    | false
    | {
        store?: SnapshotStorePort;
        autoSave?: AutoSavePolicy;
        autoSaveKey?: string;
      };
}

/**
 * Default ingress. Returns a running `Agent` with Phase A defaults wired in.
 *
 * ```ts
 * const pet = createAgent({ id: 'whiskers', species: 'cat' });
 * await pet.tick(0.016);
 * ```
 */
export function createAgent(config: CreateAgentConfig): Agent {
  const speciesDescriptor = resolveSpecies(config.species, config.speciesRegistry);
  const speciesId =
    speciesDescriptor?.id ?? (typeof config.species === 'string' ? config.species : '');

  const identity: AgentIdentity = {
    id: config.id,
    name: config.name ?? config.id,
    version: config.version ?? '0.0.0',
    role: config.role ?? 'npc',
    species: speciesId,
    ...(config.persona !== undefined
      ? { persona: config.persona }
      : speciesDescriptor?.persona !== undefined
        ? { persona: speciesDescriptor.persona }
        : {}),
  };

  const eventBus = config.eventBus ?? new InMemoryEventBus();
  const clock = config.clock ?? new SystemClock();
  const rng = resolveRng(config.rng, config.id);
  const needs = resolveNeeds(config.needs ?? speciesDescriptor?.needs);

  const lifecycle = resolveLifecycle(config.lifecycle ?? speciesDescriptor?.lifecycle);
  const ageModel =
    lifecycle !== undefined
      ? new AgeModel({
          bornAt: config.bornAt ?? clock.now(),
          schedule: lifecycle.schedule,
          ...(config.initialAgeSeconds !== undefined
            ? { initialAgeSeconds: config.initialAgeSeconds }
            : {}),
          ...(config.initialStage !== undefined ? { initialStage: config.initialStage } : {}),
        })
      : undefined;

  const moodModel = resolveMoodModel(config.moodModel, Boolean(needs ?? ageModel));
  const randomEvents = resolveRandomEvents(config.randomEvents);
  const memory = config.memory ?? new InMemoryMemoryAdapter();
  const { snapshotStore, autoSave, autoSaveKey } = resolvePersistence(config.persistence);
  const skills = resolveSkills(config.skills);

  // Auto-install any skills contributed by config-time modules so the
  // SkillRegistry is fully populated by the time the agent starts ticking.
  for (const mod of config.modules ?? []) {
    for (const skill of mod.skills ?? []) {
      skills.register(skill);
    }
  }

  // Build an embodiment from species defaults if the consumer didn't
  // supply one. Locomotion + appearance flow through.
  let embodiment = config.embodiment;
  if (embodiment === undefined && speciesDescriptor) {
    const appearance = speciesDescriptor.appearance;
    const locomotion = speciesDescriptor.locomotion;
    if (appearance !== undefined || locomotion !== undefined) {
      embodiment = {
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        appearance: appearance ?? {
          shape: 'rectangle',
          width: 32,
          height: 32,
          color: '#ffffff',
          visible: true,
        },
        locomotion: locomotion ?? 'static',
      };
    }
  }

  const agent = new Agent({
    identity,
    eventBus,
    clock,
    rng,
    ...(config.logger !== undefined ? { logger: config.logger } : {}),
    ...(config.validator !== undefined ? { validator: config.validator } : {}),
    ...(config.timeScale !== undefined ? { timeScale: config.timeScale } : {}),
    ...(config.controlMode !== undefined ? { controlMode: config.controlMode } : {}),
    ...(config.modules !== undefined ? { modules: config.modules } : {}),
    ...(needs ? { needs } : {}),
    ...(config.modifiers !== undefined ? { modifiers: config.modifiers } : {}),
    ...(ageModel !== undefined ? { ageModel } : {}),
    ...(lifecycle?.capabilities !== undefined ? { stageCapabilities: lifecycle.capabilities } : {}),
    ...(moodModel !== undefined ? { moodModel } : {}),
    ...(embodiment !== undefined ? { embodiment } : {}),
    ...(randomEvents !== undefined ? { randomEvents } : {}),
    memory,
    ...(config.remote !== undefined ? { remote: config.remote } : {}),
    ...(config.scripted !== undefined ? { scripted: config.scripted } : {}),
    ...(snapshotStore !== undefined ? { snapshotStore } : {}),
    ...(autoSave !== undefined ? { autoSave } : {}),
    ...(autoSaveKey !== undefined ? { autoSaveKey } : {}),
    ...(config.reasoner !== undefined ? { reasoner: config.reasoner } : {}),
    ...(config.behavior !== undefined ? { behavior: config.behavior } : {}),
    ...(config.learner !== undefined ? { learner: config.learner } : {}),
    ...(config.needsPolicy !== undefined ? { needsPolicy: config.needsPolicy } : {}),
    ...(config.animation !== undefined ? { animation: config.animation } : {}),
    skills,
  });

  // Apply species-declared passive modifiers after construction so the
  // standard ModifierApplied events fire on the bus.
  if (speciesDescriptor?.passiveModifiers) {
    for (const mod of speciesDescriptor.passiveModifiers) {
      agent.applyModifier(mod);
    }
  }

  return agent;
}

function resolveSkills(input: SkillRegistry | readonly Skill[] | undefined): SkillRegistry {
  if (input === undefined) return new SkillRegistry();
  if (input instanceof SkillRegistry) return input;
  const reg = new SkillRegistry();
  reg.registerAll(input);
  return reg;
}

function resolveSpecies(
  species: Species | SpeciesDescriptor,
  registry: SpeciesRegistry | undefined,
): SpeciesDescriptor | undefined {
  if (typeof species === 'string') {
    if (registry?.has(species)) return registry.get(species);
    return undefined;
  }
  if (species && typeof species === 'object' && 'id' in species) {
    return species;
  }
  throw new InvalidSpeciesError(
    'Invalid `species` config — expected string id or SpeciesDescriptor.',
  );
}

function resolveRandomEvents(
  input: RandomEventTicker | readonly RandomEventDef[] | undefined,
): RandomEventTicker | undefined {
  if (input === undefined) return undefined;
  if (input instanceof RandomEventTicker) return input;
  return new RandomEventTicker(input);
}

function resolvePersistence(input: CreateAgentConfig['persistence']): {
  snapshotStore: SnapshotStorePort | undefined;
  autoSave: AutoSavePolicy | undefined;
  autoSaveKey: string | undefined;
} {
  if (input === false) {
    return { snapshotStore: undefined, autoSave: undefined, autoSaveKey: undefined };
  }
  const store = input?.store ?? pickDefaultSnapshotStore();
  return {
    snapshotStore: store,
    autoSave: input?.autoSave,
    autoSaveKey: input?.autoSaveKey,
  };
}

function resolveLifecycle(
  lifecycle: LifecycleDescriptor | LifeStageSchedule | undefined,
): LifecycleDescriptor | undefined {
  if (lifecycle === undefined) return undefined;
  if (Array.isArray(lifecycle)) {
    return { schedule: lifecycle };
  }
  return lifecycle as LifecycleDescriptor;
}

function resolveMoodModel(
  override: MoodModel | false | undefined,
  autoEnable: boolean,
): MoodModel | undefined {
  if (override === false) return undefined;
  if (override !== undefined) return override;
  return autoEnable ? new DefaultMoodModel() : undefined;
}

function resolveNeeds(needs: Needs | readonly Need[] | undefined): Needs | undefined {
  if (needs === undefined) return undefined;
  if (needs instanceof Needs) return needs;
  return new Needs(needs);
}

function resolveRng(rng: Rng | number | string | undefined, fallbackSeed: string): Rng {
  if (rng === undefined) return new SeededRng(fallbackSeed);
  if (typeof rng === 'number' || typeof rng === 'string') return new SeededRng(rng);
  return rng;
}
