/**
 * Species identifier. Free-form string so consumers can model anything from
 * `'cat'` to `'desert-fox'` to `'tardigrade'` without library support.
 *
 * A richer `SpeciesDescriptor` (needs catalog, default persona traits,
 * allowed locomotion, lifecycle schedule) is built on top of this identifier
 * in M12.
 */
export type Species = string;
