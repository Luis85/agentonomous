[MAJOR] src/persistence/migrateSnapshot.ts:34
  Problem: NaN schema versions are accepted because the guard is `typeof versionRaw === 'number'`.
  Why it matters: Corrupt snapshots bypass migration/compat checks (`schemaVersion: NaN` returns as-is), so restore behavior becomes undefined instead of failing fast.
  Quote: `const currentVersion = typeof versionRaw === 'number' ? versionRaw : 0;`
  Fix:
  ```diff
  - const currentVersion = typeof versionRaw === 'number' ? versionRaw : 0;
  + const currentVersion =
  +   typeof versionRaw === 'number' && Number.isInteger(versionRaw) && versionRaw >= 0
  +     ? versionRaw
  +     : 0;
  + if (typeof versionRaw === 'number' && !Number.isInteger(versionRaw)) {
  +   throw new SnapshotRestoreError(`Invalid schemaVersion: ${String(versionRaw)}`);
  + }
  ```

[MAJOR] src/persistence/AutoSavePolicy.ts:62
  Problem: Negative autosave thresholds are treated as enabled and immediately satisfied.
  Why it matters: `everyTicks: -1` or `everyVirtualSeconds: -5` makes `shouldSave()` true on every tick, causing unbounded persistence churn and possible storage hot-looping.
  Quote: `if (this.policy.everyTicks && this.ticksSinceSave >= this.policy.everyTicks) {`
  Fix:
  ```diff
  + function isPositiveNumber(n: number | undefined): n is number {
  +   return n !== undefined && Number.isFinite(n) && n > 0;
  + }
  ...
  - if (this.policy.everyTicks && this.ticksSinceSave >= this.policy.everyTicks) {
  + if (isPositiveNumber(this.policy.everyTicks) && this.ticksSinceSave >= this.policy.everyTicks) {
      return true;
    }
  - if (this.policy.everyVirtualSeconds && this.virtualSecondsSinceSave >= this.policy.everyVirtualSeconds) {
  + if (
  +   isPositiveNumber(this.policy.everyVirtualSeconds) &&
  +   this.virtualSecondsSinceSave >= this.policy.everyVirtualSeconds
  + ) {
      return true;
    }
  ```

[MINOR] src/persistence/offlineCatchUp.ts:39
  Problem: `runCatchUp` does not validate `chunkVirtualSeconds`/`maxChunks` options.
  Why it matters: With `chunkVirtualSeconds: 0`, the loop executes `maxChunks` times with `chunk=0`, reports `chunksProcessed > 0` but `totalVirtualSeconds=0`, and leaves `truncated=true` — misleading and wasted work.
  Quote: `const chunk = Math.min(remaining, chunkSize);`
  Fix:
  ```diff
    const chunkSize = opts.chunkVirtualSeconds ?? OFFLINE_CATCHUP_DEFAULTS.chunkVirtualSeconds;
    const maxChunks = opts.maxChunks ?? OFFLINE_CATCHUP_DEFAULTS.maxChunks;
  + if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
  +   throw new RangeError(`runCatchUp: chunkVirtualSeconds must be > 0, got ${String(chunkSize)}`);
  + }
  + if (!Number.isInteger(maxChunks) || maxChunks <= 0) {
  +   throw new RangeError(`runCatchUp: maxChunks must be a positive integer, got ${String(maxChunks)}`);
  + }
  ```

Blockers: 0
Majors: 2
Minors: 1
Not reviewed: `examples/**` runtime UX behavior in browser, external adapter internals in third-party packages (`mistreevous`, `js-son-agent`, `@tensorflow/tfjs-*`) beyond this library's wrapper logic.
