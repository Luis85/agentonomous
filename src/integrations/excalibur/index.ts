// ExcaliburJS integration — import adapters from
// `agentonomous/integrations/excalibur` so consumers only pull the
// Excalibur peer dep into their bundle when they actually use this.

export { ExcaliburAgentActor } from './ExcaliburAgentActor.js';
export { ExcaliburRemoteController } from './ExcaliburRemoteController.js';
export {
  ExcaliburAnimationBridge,
  type ExcaliburAnimationBridgeOptions,
} from './ExcaliburAnimationBridge.js';
export type { ActorLike, InputSourceLike, Vector2Like } from './types.js';

export const EXCALIBUR_INTEGRATION_VERSION = '0.0.0';
