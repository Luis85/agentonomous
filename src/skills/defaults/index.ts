import type { AgentModule } from '../../agent/AgentModule.js';
import { INTERACTION_REQUESTED } from '../../interaction/InteractionRequestedEvent.js';
import { CleanSkill } from './CleanSkill.js';
import { ExpressMeowSkill } from './ExpressMeowSkill.js';
import { ExpressSadSkill } from './ExpressSadSkill.js';
import { ExpressSleepySkill } from './ExpressSleepySkill.js';
import { FeedSkill } from './FeedSkill.js';
import { MedicateSkill } from './MedicateSkill.js';
import { PetSkill } from './PetSkill.js';
import { PlaySkill } from './PlaySkill.js';
import { RestSkill } from './RestSkill.js';
import { ScoldSkill } from './ScoldSkill.js';

/**
 * Bundle of active player-invoked skills plus a reactive handler that
 * rewrites `InteractionRequested` events into `InvokeSkillRequested` events
 * the agent behavior runner can dispatch. Consumers who want the defaults
 * wired with no ceremony install this module.
 */
export const defaultPetInteractionModule: AgentModule = {
  id: 'default-pet-interactions',
  skills: [FeedSkill, CleanSkill, PlaySkill, RestSkill, ScoldSkill, PetSkill, MedicateSkill],
  reactiveHandlers: [
    {
      on: INTERACTION_REQUESTED,
      handle: async (event, agent) => {
        const e = event as { verb?: string; params?: Record<string, unknown> };
        if (!e.verb) return;
        // Route player interactions directly to the matching skill. The
        // facade's `invokeSkill` fires SkillCompleted / SkillFailed on the
        // bus, so consumers can observe success/failure without wiring
        // extra events.
        await agent.invokeSkill(e.verb, e.params);
      },
    },
  ],
};

/** The active, player-invoked default skills. */
export const defaultActiveSkills = [
  FeedSkill,
  CleanSkill,
  PlaySkill,
  RestSkill,
  ScoldSkill,
  PetSkill,
  MedicateSkill,
] as const;

/** The autonomous expressive reaction skills. */
export const defaultExpressionSkills = [
  ExpressMeowSkill,
  ExpressSadSkill,
  ExpressSleepySkill,
] as const;

export {
  CleanSkill,
  ExpressMeowSkill,
  ExpressSadSkill,
  ExpressSleepySkill,
  FeedSkill,
  MedicateSkill,
  PetSkill,
  PlaySkill,
  RestSkill,
  ScoldSkill,
};
