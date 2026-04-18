/**
 * High-level role an agent fulfills in a simulation.
 *
 * The union is open (`(string & {})`) so consumers can declare custom roles
 * without a library version bump, while still getting IntelliSense on the
 * canonical values.
 */
export type AgentRole = 'npc' | 'player-proxy' | 'system' | (string & {});
