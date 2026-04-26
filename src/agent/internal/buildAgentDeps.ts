import { InMemoryEventBus } from '../../events/InMemoryEventBus.js';
import { AgeModel } from '../../lifecycle/AgeModel.js';
import type { LifecycleDescriptor } from '../../lifecycle/defineLifecycle.js';
import type { LifeStageSchedule } from '../../lifecycle/LifeStageSchedule.js';
import { InMemoryMemoryAdapter } from '../../memory/InMemoryMemoryAdapter.js';
import type { MemoryRepository } from '../../memory/MemoryRepository.js';
import { DefaultMoodModel } from '../../mood/DefaultMoodModel.js';
import type { MoodModel } from '../../mood/MoodModel.js';
import type { Need } from '../../needs/Need.js';
import { Needs } from '../../needs/Needs.js';
import { ExpressiveNeedsPolicy } from '../../needs/ExpressiveNeedsPolicy.js';
import type { NeedsPolicy } from '../../needs/NeedsPolicy.js';
import type { AutoSavePolicy } from '../../persistence/AutoSavePolicy.js';
import { pickDefaultSnapshotStore } from '../../persistence/pickDefaultSnapshotStore.js';
import type { SnapshotStorePort } from '../../persistence/SnapshotStorePort.js';
import type { Embodiment } from '../../body/Embodiment.js';
import type { EventBusPort } from '../../events/EventBusPort.js';
import type { Rng } from '../../ports/Rng.js';
import { SeededRng } from '../../ports/SeededRng.js';
import { SystemClock } from '../../ports/SystemClock.js';
import type { WallClock } from '../../ports/WallClock.js';
import { RandomEventTicker } from '../../randomEvents/RandomEventTicker.js';
import type { RandomEventDef } from '../../randomEvents/defineRandomEvent.js';
import type { Skill } from '../../skills/Skill.js';
import { SkillRegistry } from '../../skills/SkillRegistry.js';
import type { SpeciesDescriptor } from '../../species/SpeciesDescriptor.js';
import type { SpeciesRegistry } from '../../species/SpeciesRegistry.js';
import type { AgentDependencies } from '../Agent.js';
import type { AgentIdentity } from '../AgentIdentity.js';
import type { AgentModule } from '../AgentModule.js';
import { InvalidSpeciesError } from '../errors.js';
import type { Species } from '../Species.js';
import type { CreateAgentConfig } from '../createAgent.js';

/**
 * Internal bag of all subsystem instances resolved from `CreateAgentConfig`.
 * One-pass resolution keeps the `createAgent` orchestrator flat and lets
 * each subsystem's defaulting policy live in its own `resolve*` helper.
 */
export type ResolvedDeps = {
  identity: AgentIdentity;
  speciesDescriptor: SpeciesDescriptor | undefined;
  eventBus: EventBusPort;
  clock: WallClock;
  rng: Rng;
  needs: Needs | undefined;
  lifecycle: LifecycleDescriptor | undefined;
  ageModel: AgeModel | undefined;
  moodModel: MoodModel | undefined;
  needsPolicy: NeedsPolicy | undefined;
  randomEvents: RandomEventTicker | undefined;
  memory: MemoryRepository;
  snapshotStore: SnapshotStorePort | undefined;
  autoSave: AutoSavePolicy | undefined;
  autoSaveKey: string | undefined;
  skills: SkillRegistry;
  embodiment: Embodiment | undefined;
};

export function buildAgentDeps(config: CreateAgentConfig): ResolvedDeps {
  const speciesDescriptor = resolveSpecies(config.species, config.speciesRegistry);
  const clock = config.clock ?? new SystemClock();
  const needs = resolveNeeds(config.needs ?? speciesDescriptor?.needs);
  const lifecycle = resolveLifecycle(config.lifecycle ?? speciesDescriptor?.lifecycle);
  const ageModel = buildAgeModel(config, lifecycle, clock);
  const persistence = resolvePersistence(config.persistence);

  return {
    identity: buildIdentity(config, speciesDescriptor),
    speciesDescriptor,
    eventBus: config.eventBus ?? new InMemoryEventBus(),
    clock,
    rng: resolveRng(config.rng, config.id),
    needs,
    lifecycle,
    ageModel,
    moodModel: resolveMoodModel(config.moodModel, Boolean(needs ?? ageModel)),
    needsPolicy: resolveNeedsPolicy(config.needsPolicy, needs),
    randomEvents: resolveRandomEvents(config.randomEvents),
    memory: config.memory ?? new InMemoryMemoryAdapter(),
    snapshotStore: persistence.snapshotStore,
    autoSave: persistence.autoSave,
    autoSaveKey: persistence.autoSaveKey,
    skills: resolveSkills(config.skills),
    embodiment: resolveEmbodiment(config.embodiment, speciesDescriptor),
  };
}

export function toAgentDependencies(
  deps: ResolvedDeps,
  config: CreateAgentConfig,
): AgentDependencies {
  return {
    identity: deps.identity,
    eventBus: deps.eventBus,
    clock: deps.clock,
    rng: deps.rng,
    memory: deps.memory,
    skills: deps.skills,
    ...portOptions(config),
    ...lifecycleOptions(deps, config),
    ...worldOptions(deps, config),
    ...persistenceOptions(deps),
    ...cognitionOptions(deps, config),
  };
}

/**
 * Module-contributed skills install after consumer-pre-registered ones,
 * with consumer ids preserved on collision. Module-vs-module collisions
 * still throw `DuplicateSkillError` — silent "first module wins" would
 * hide cross-module bugs.
 */
export function installModuleSkills(
  skills: SkillRegistry,
  modules: readonly AgentModule[] | undefined,
): void {
  if (modules === undefined || modules.length === 0) return;
  const consumerSkillIds = new Set(skills.list().map((s) => s.id));
  for (const mod of modules) {
    for (const skill of mod.skills ?? []) {
      if (consumerSkillIds.has(skill.id)) continue;
      skills.register(skill);
    }
  }
}

function buildIdentity(
  config: CreateAgentConfig,
  speciesDescriptor: SpeciesDescriptor | undefined,
): AgentIdentity {
  const speciesId =
    speciesDescriptor?.id ?? (typeof config.species === 'string' ? config.species : '');
  const persona = config.persona ?? speciesDescriptor?.persona;
  return {
    id: config.id,
    name: config.name ?? config.id,
    version: config.version ?? '0.0.0',
    role: config.role ?? 'npc',
    species: speciesId,
    ...(persona !== undefined ? { persona } : {}),
  };
}

function buildAgeModel(
  config: CreateAgentConfig,
  lifecycle: LifecycleDescriptor | undefined,
  clock: WallClock,
): AgeModel | undefined {
  if (lifecycle === undefined) return undefined;
  return new AgeModel({
    bornAt: config.bornAt ?? clock.now(),
    schedule: lifecycle.schedule,
    ...(config.initialAgeSeconds !== undefined
      ? { initialAgeSeconds: config.initialAgeSeconds }
      : {}),
    ...(config.initialStage !== undefined ? { initialStage: config.initialStage } : {}),
  });
}

function portOptions(config: CreateAgentConfig): Partial<AgentDependencies> {
  return {
    ...(config.logger !== undefined ? { logger: config.logger } : {}),
    ...(config.validator !== undefined ? { validator: config.validator } : {}),
    ...(config.timeScale !== undefined ? { timeScale: config.timeScale } : {}),
    ...(config.controlMode !== undefined ? { controlMode: config.controlMode } : {}),
    ...(config.modules !== undefined ? { modules: config.modules } : {}),
  };
}

function lifecycleOptions(
  deps: ResolvedDeps,
  config: CreateAgentConfig,
): Partial<AgentDependencies> {
  return {
    ...(deps.needs !== undefined ? { needs: deps.needs } : {}),
    ...(config.modifiers !== undefined ? { modifiers: config.modifiers } : {}),
    ...(deps.ageModel !== undefined ? { ageModel: deps.ageModel } : {}),
    ...(deps.lifecycle?.capabilities !== undefined
      ? { stageCapabilities: deps.lifecycle.capabilities }
      : {}),
    ...(deps.moodModel !== undefined ? { moodModel: deps.moodModel } : {}),
  };
}

function worldOptions(deps: ResolvedDeps, config: CreateAgentConfig): Partial<AgentDependencies> {
  return {
    ...(deps.embodiment !== undefined ? { embodiment: deps.embodiment } : {}),
    ...(deps.randomEvents !== undefined ? { randomEvents: deps.randomEvents } : {}),
    ...(config.remote !== undefined ? { remote: config.remote } : {}),
    ...(config.scripted !== undefined ? { scripted: config.scripted } : {}),
  };
}

function persistenceOptions(deps: ResolvedDeps): Partial<AgentDependencies> {
  return {
    ...(deps.snapshotStore !== undefined ? { snapshotStore: deps.snapshotStore } : {}),
    ...(deps.autoSave !== undefined ? { autoSave: deps.autoSave } : {}),
    ...(deps.autoSaveKey !== undefined ? { autoSaveKey: deps.autoSaveKey } : {}),
  };
}

function cognitionOptions(
  deps: ResolvedDeps,
  config: CreateAgentConfig,
): Partial<AgentDependencies> {
  return {
    ...(config.reasoner !== undefined ? { reasoner: config.reasoner } : {}),
    ...(config.behavior !== undefined ? { behavior: config.behavior } : {}),
    ...(config.learner !== undefined ? { learner: config.learner } : {}),
    ...(deps.needsPolicy !== undefined ? { needsPolicy: deps.needsPolicy } : {}),
    ...(config.animation !== undefined ? { animation: config.animation } : {}),
  };
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

/**
 * Auto-wires an `ExpressiveNeedsPolicy` when the consumer configured
 * `needs` but no explicit `needsPolicy`. Without this, the autonomous
 * cognition pipeline silently produces zero candidates and the pet
 * appears inert.
 */
function resolveNeedsPolicy(
  explicit: NeedsPolicy | undefined,
  needs: Needs | undefined,
): NeedsPolicy | undefined {
  if (explicit !== undefined) return explicit;
  if (needs === undefined) return undefined;
  return new ExpressiveNeedsPolicy();
}

function resolveRng(rng: Rng | number | string | undefined, fallbackSeed: string): Rng {
  if (rng === undefined) return new SeededRng(fallbackSeed);
  if (typeof rng === 'number' || typeof rng === 'string') return new SeededRng(rng);
  return rng;
}

/**
 * Builds an embodiment from species defaults when the consumer didn't
 * supply one but the species declares appearance/locomotion. Without this
 * shim, species-defined visuals would never reach the agent.
 */
function resolveEmbodiment(
  explicit: Embodiment | undefined,
  speciesDescriptor: SpeciesDescriptor | undefined,
): Embodiment | undefined {
  if (explicit !== undefined) return explicit;
  if (!speciesDescriptor) return undefined;
  const appearance = speciesDescriptor.appearance;
  const locomotion = speciesDescriptor.locomotion;
  if (appearance === undefined && locomotion === undefined) return undefined;
  return {
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
