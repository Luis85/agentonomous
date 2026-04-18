import { InMemoryEventBus } from '../events/InMemoryEventBus.js';
import type { EventBusPort } from '../events/EventBusPort.js';
import type { Embodiment } from '../body/Embodiment.js';
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
  /** Species identifier (free-form string; M12 adds rich descriptors). */
  species: Species;

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
  const identity: AgentIdentity = {
    id: config.id,
    name: config.name ?? config.id,
    version: config.version ?? '0.0.0',
    role: config.role ?? 'npc',
    species: config.species,
    ...(config.persona !== undefined ? { persona: config.persona } : {}),
  };

  const eventBus = config.eventBus ?? new InMemoryEventBus();
  const clock = config.clock ?? new SystemClock();
  const rng = resolveRng(config.rng, config.id);
  const needs = resolveNeeds(config.needs);

  const lifecycle = resolveLifecycle(config.lifecycle);
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

  return new Agent({
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
    ...(config.embodiment !== undefined ? { embodiment: config.embodiment } : {}),
    ...(randomEvents !== undefined ? { randomEvents } : {}),
    memory,
    ...(config.remote !== undefined ? { remote: config.remote } : {}),
    ...(config.scripted !== undefined ? { scripted: config.scripted } : {}),
    ...(snapshotStore !== undefined ? { snapshotStore } : {}),
    ...(autoSave !== undefined ? { autoSave } : {}),
    ...(autoSaveKey !== undefined ? { autoSaveKey } : {}),
  });
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
