/**
 * How an agent moves through space. The well-known literals are hints for
 * renderers and animation drivers; the `(string & {})` escape hatch lets
 * hosts declare custom modes (e.g. `'teleport'`, `'hover'`) without patching
 * the library.
 */
export type LocomotionMode =
  | 'walk'
  | 'swim'
  | 'fly'
  | 'crawl'
  | 'slither'
  | 'static'
  | (string & {});
