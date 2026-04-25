import { AnimationStateMachine } from '../../animation/AnimationStateMachine.js';
import type { Embodiment } from '../../body/Embodiment.js';
import type { BehaviorRunner } from '../../cognition/behavior/BehaviorRunner.js';
import { DirectBehaviorRunner } from '../../cognition/behavior/DirectBehaviorRunner.js';
import type { Learner } from '../../cognition/learning/Learner.js';
import { NoopLearner } from '../../cognition/learning/NoopLearner.js';
import type { Reasoner } from '../../cognition/reasoning/Reasoner.js';
import { UrgencyReasoner } from '../../cognition/reasoning/UrgencyReasoner.js';
import type { AgeModel } from '../../lifecycle/AgeModel.js';
import type { StageCapabilityMap } from '../../lifecycle/StageCapabilities.js';
import type { MemoryRepository } from '../../memory/MemoryRepository.js';
import { Modifiers } from '../../modifiers/Modifiers.js';
import type { MoodModel } from '../../mood/MoodModel.js';
import type { Needs } from '../../needs/Needs.js';
import type { NeedsPolicy } from '../../needs/NeedsPolicy.js';
import { AutoSaveTracker, DEFAULT_AUTOSAVE_POLICY } from '../../persistence/AutoSavePolicy.js';
import type { SnapshotStorePort } from '../../persistence/SnapshotStorePort.js';
import { NullLogger, type Logger } from '../../ports/Logger.js';
import type { Validator } from '../../ports/Validator.js';
import type { RandomEventTicker } from '../../randomEvents/RandomEventTicker.js';
import { SkillRegistry } from '../../skills/SkillRegistry.js';
import type { AgentDependencies } from '../Agent.js';
import type { ControlMode } from '../ControlMode.js';
import { MissingDependencyError } from '../errors.js';
import type { RemoteController } from '../RemoteController.js';
import type { ScriptedController } from '../ScriptedController.js';

const DEFAULT_TIME_SCALE = 1;

/** @internal Throws when any of the required ports is missing. */
export function assertRequiredDeps(deps: AgentDependencies): void {
  if (!deps.identity) throw new MissingDependencyError('identity');
  if (!deps.eventBus) throw new MissingDependencyError('eventBus');
  if (!deps.clock) throw new MissingDependencyError('clock');
  if (!deps.rng) throw new MissingDependencyError('rng');
}

export interface ResolvedPorts {
  logger: Logger;
  validator: Validator | undefined;
  timeScale: number;
  controlMode: ControlMode;
}

export function resolveCorePorts(deps: AgentDependencies): ResolvedPorts {
  return {
    logger: deps.logger ?? new NullLogger(),
    validator: deps.validator,
    timeScale: deps.timeScale ?? DEFAULT_TIME_SCALE,
    controlMode: deps.controlMode ?? 'autonomous',
  };
}

export interface ResolvedSubsystems {
  needs: Needs | undefined;
  modifiers: Modifiers;
  ageModel: AgeModel | undefined;
  stageCapabilities: StageCapabilityMap | undefined;
  moodModel: MoodModel | undefined;
  embodiment: Embodiment | undefined;
  randomEvents: RandomEventTicker | undefined;
  memory: MemoryRepository | undefined;
  remote: RemoteController | undefined;
  scripted: ScriptedController | undefined;
}

export function resolveSubsystems(deps: AgentDependencies): ResolvedSubsystems {
  return {
    needs: deps.needs,
    modifiers: deps.modifiers ?? new Modifiers(),
    ageModel: deps.ageModel,
    stageCapabilities: deps.stageCapabilities,
    moodModel: deps.moodModel,
    embodiment: deps.embodiment,
    randomEvents: deps.randomEvents,
    memory: deps.memory,
    remote: deps.remote,
    scripted: deps.scripted,
  };
}

export interface ResolvedCognition {
  reasoner: Reasoner;
  behavior: BehaviorRunner;
  learner: Learner;
  skills: SkillRegistry;
  needsPolicy: NeedsPolicy | undefined;
  animation: AnimationStateMachine;
}

export function resolveCognition(deps: AgentDependencies): ResolvedCognition {
  return {
    reasoner: deps.reasoner ?? new UrgencyReasoner(),
    behavior: deps.behavior ?? new DirectBehaviorRunner(),
    learner: deps.learner ?? new NoopLearner(),
    skills: deps.skills ?? new SkillRegistry(),
    needsPolicy: deps.needsPolicy,
    animation:
      deps.animation instanceof AnimationStateMachine
        ? deps.animation
        : new AnimationStateMachine(deps.animation),
  };
}

export interface ResolvedPersistence {
  snapshotStore: SnapshotStorePort | undefined;
  autoSaveKey: string;
  autoSaveTracker: AutoSaveTracker | undefined;
}

export function resolvePersistence(deps: AgentDependencies, agentId: string): ResolvedPersistence {
  const snapshotStore = deps.snapshotStore;
  return {
    snapshotStore,
    autoSaveKey: deps.autoSaveKey ?? agentId,
    autoSaveTracker:
      snapshotStore !== undefined
        ? new AutoSaveTracker(deps.autoSave ?? DEFAULT_AUTOSAVE_POLICY)
        : undefined,
  };
}
