/**
 * How the agent's per-tick actions are chosen.
 *
 * - `'autonomous'` — full cognition pipeline (reasoner + behavior runner).
 * - `'scripted'`   — a `ScriptedController` feeds pre-canned actions.
 * - `'remote'`     — a `RemoteController` (player input, bot, network) pushes
 *   actions; cognition is skipped this tick.
 *
 * Introduced in M6; agents default to `'autonomous'`.
 */
export type ControlMode = 'autonomous' | 'scripted' | 'remote';
