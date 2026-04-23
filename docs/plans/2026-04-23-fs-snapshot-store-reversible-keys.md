# 0.9.7 `FsSnapshotStore` Reversible Key Encoding — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `FsSnapshotStore.sanitizeKey`'s lossy
`/[^a-zA-Z0-9._-]/g → '_'` substitution with a reversible percent-encoding
scheme so distinct logical keys always map to distinct on-disk filenames —
and `list()` can decode filenames back to the original logical keys. Today
`"user/1"`, `"user_1"`, and `"user 1"` all collide to `user_1.json`, which
is a silent data-loss bug on `save()` and a round-trip bug on `list()`.

**Architecture:** Single bundled PR. Pure file-IO-level change inside
`src/persistence/FsSnapshotStore.ts`. Replace `sanitizeKey` with a pair of
pure functions — `encodeKey(logical) → filename` and `decodeKey(filename)
→ logical` — both exported for direct unit testing. `pathFor()` uses
`encodeKey`; `list()` maps `decodeKey` over the read directory entries.
Encoding rule: any character outside `[A-Za-z0-9._-]`, plus `%` itself,
becomes `%XX` (two-digit uppercase hex of the char's code point; multibyte
characters are first UTF-8 encoded then byte-wise percent-escaped — same
semantics as `encodeURIComponent` but with a narrower unreserved set).

The PR also introduces `tests/unit/persistence/FsSnapshotStore.test.ts` —
the store has no dedicated test file today. Tests use an in-memory
`FsAdapter` stub (the `FsAdapter` interface is already injectable, so no
real disk required).

**Backward compatibility:** Pre-1.0 library. Existing on-disk saves written
under the old `sanitizeKey` layout will **not** be readable through the new
`encodeKey` scheme. This is an acceptable break at the current maturity
level; the changeset and PR body document it explicitly. A dual-read fallback
was considered and rejected — it would complicate `load()` and `list()` for
a narrow audience (Node-only consumers already running pre-1.0 builds).

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest,
ESM with `.js` extensions on relative imports. No new runtime deps.

**Design reference:** Remediation plan Workstream 3. Encoding choice
(percent-encoding over base64url) is documented in this plan's Architecture
section — base64url is compact but obscures logical keys in the filesystem
and generates `-` / `_` that would need decoding-aware list behavior anyway.
Percent-encoding keeps filenames human-inspectable.

---

## File Structure

### New files

- `tests/unit/persistence/FsSnapshotStore.test.ts` — first test file for the
  store. Covers encoder/decoder round-trip, collision avoidance, and
  integration via save → list → load → delete.
- `.changeset/<random>.md` — patch bump changeset.

### Modified files

- `src/persistence/FsSnapshotStore.ts` — replace `sanitizeKey` with
  `encodeKey` + `decodeKey` (both exported), update `pathFor()` to call
  `encodeKey`, update `list()` to strip `.json` then `decodeKey`.

### Deliberately untouched

- `src/persistence/SnapshotStorePort.ts` — the port contract already
  advertises logical keys. The fix aligns implementation with the already-
  advertised contract.
- `src/persistence/InMemorySnapshotStore.ts` / `LocalStorageSnapshotStore.ts`
  — neither does filesystem-style sanitization. Out of scope.
- `FsAdapter` interface shape — unchanged.

---

## Task 0: Cut topic branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on develop.**

Run: `git switch develop && git status && git pull --ff-only origin develop`
Expected: clean tree, fast-forward.

- [ ] **Step 2: Cut the topic branch.**

Run: `git switch -c fix/fs-snapshot-store-reversible-keys`

---

## Task 1: Introduce exported `encodeKey` / `decodeKey` helpers

**Files:**

- Modify: `src/persistence/FsSnapshotStore.ts`

- [ ] **Step 1: Write the helpers.**

Replace the existing `sanitizeKey` function at the bottom of the file with:

```ts
/**
 * Encode a logical snapshot key into a filesystem-safe filename component.
 *
 * Reversible percent-encoding: every character outside `[A-Za-z0-9._-]`,
 * plus `%` itself, becomes `%XX` where `XX` is the uppercase hex of the
 * char's UTF-8 byte(s). `encodeURIComponent` does most of the work; we
 * additionally escape `.`, `-`, `_`, `*`, `(`, `)`, `'`, `!`, `~` only
 * where the spec leaves them unreserved — here we keep `.`, `-`, `_`
 * unreserved (filenames tolerate them well) and escape the rest.
 *
 * The result stays inside the unreserved subset of
 * `/[A-Za-z0-9._\-%]+/` so `decodeKey` can round-trip by reading the
 * `%XX` sequences back.
 */
export function encodeKey(key: string): string {
  let out = '';
  // Pass through the 64-char safe set directly; everything else goes via
  // encodeURIComponent (UTF-8 aware), then we additionally escape the
  // spec-unreserved chars it leaves alone so our safe-set stays narrow.
  for (const char of key) {
    if (/^[A-Za-z0-9._-]$/.test(char)) {
      out += char;
    } else {
      // encodeURIComponent emits multi-byte UTF-8 as chained %XX. That's
      // exactly what we want — byte-wise percent-escaping.
      out += encodeURIComponent(char);
      // encodeURIComponent leaves ! ' ( ) * ~ unreserved. Escape them
      // manually so the output alphabet is strictly [A-Za-z0-9._\-%].
      out = out.replace(
        /[!'()*~]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
      );
    }
  }
  return out;
}

/**
 * Decode a filename (sans `.json` suffix) back into its logical snapshot
 * key. Inverse of `encodeKey`. `decodeURIComponent` handles the UTF-8
 * re-assembly of multi-byte characters from chained `%XX` sequences.
 */
export function decodeKey(encoded: string): string {
  return decodeURIComponent(encoded);
}
```

> **Why not just `encodeURIComponent` alone?** It leaves `! ' ( ) * ~`
> unreserved, so the output alphabet includes characters outside our
> intended safe set. The per-char replacement sweep fixes that cheaply.
> `decodeURIComponent` is still the right inverse because it treats all
> `%XX` sequences uniformly regardless of which char was escaped.

- [ ] **Step 2: Typecheck.**

Run: `npm run typecheck`
Expected: no errors. `encodeKey` / `decodeKey` are pure functions; no
runtime wiring yet.

---

## Task 2: Write the encoder/decoder unit tests

**Files:**

- Create: `tests/unit/persistence/FsSnapshotStore.test.ts`

- [ ] **Step 1: Set up the test file scaffold.**

```ts
import { describe, expect, it } from 'vitest';
import {
  decodeKey,
  encodeKey,
  FsSnapshotStore,
  type FsAdapter,
} from '../../../src/persistence/FsSnapshotStore.js';
import type { AgentSnapshot } from '../../../src/persistence/AgentSnapshot.js';

function snap(id: string): AgentSnapshot {
  return {
    schemaVersion: 2,
    snapshotAt: 0,
    identity: { id, name: id, version: '0.0.0', role: 'npc', species: 'cat' },
  };
}

class MemFs implements FsAdapter {
  readonly files = new Map<string, string>();
  readFile(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error('ENOENT'));
    return Promise.resolve(v);
  }
  writeFile(path: string, data: string): Promise<void> {
    this.files.set(path, data);
    return Promise.resolve();
  }
  mkdir(): Promise<void> {
    return Promise.resolve();
  }
  readdir(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()].map((p) => p.split('/').pop()!));
  }
  unlink(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }
  access(path: string): Promise<void> {
    return this.files.has(path) ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
  }
}
```

> **Note:** `readFile` is declared with a `(path, encoding)` signature
> in the adapter interface; our stub can ignore the encoding argument.
> Same for `writeFile` / `mkdir(opts)` — match the shape, ignore the
> extras.

- [ ] **Step 2: Write the encoder round-trip tests.**

```ts
describe('encodeKey / decodeKey', () => {
  it('round-trips the safe alphabet unchanged', () => {
    const keys = ['abc', 'ABC', '123', 'foo.bar', 'foo_bar', 'foo-bar'];
    for (const k of keys) {
      expect(encodeKey(k)).toBe(k);
      expect(decodeKey(encodeKey(k))).toBe(k);
    }
  });

  it('escapes path separators, spaces, and symbols', () => {
    expect(encodeKey('user/1')).toBe('user%2F1');
    expect(encodeKey('user 1')).toBe('user%201');
    expect(encodeKey('user:1')).toBe('user%3A1');
    expect(encodeKey('user@example.com')).toBe('user%40example.com');
  });

  it('escapes the percent character itself for round-trip safety', () => {
    expect(encodeKey('50% off')).toBe('50%25%20off');
    expect(decodeKey(encodeKey('50% off'))).toBe('50% off');
  });

  it('escapes multi-byte unicode via UTF-8 byte-wise %XX sequences', () => {
    expect(encodeKey('café')).toBe('caf%C3%A9');
    expect(decodeKey('caf%C3%A9')).toBe('café');
  });

  it('escapes the spec-unreserved chars that encodeURIComponent leaves alone', () => {
    // encodeURIComponent leaves ! ' ( ) * ~ unreserved; our encoder must not.
    expect(encodeKey('a!b')).toBe('a%21b');
    expect(encodeKey("a'b")).toBe('a%27b');
    expect(encodeKey('a(b)')).toBe('a%28b%29');
    expect(encodeKey('a*b')).toBe('a%2Ab');
    expect(encodeKey('a~b')).toBe('a%7Eb');
  });

  it('previously-colliding keys now map to distinct filenames', () => {
    // sanitizeKey used to map all three to `user_1`.
    expect(encodeKey('user/1')).not.toBe(encodeKey('user_1'));
    expect(encodeKey('user 1')).not.toBe(encodeKey('user_1'));
    expect(encodeKey('user/1')).not.toBe(encodeKey('user 1'));
  });
});
```

- [ ] **Step 3: Run the tests.**

Run: `npm test -- FsSnapshotStore`
Expected: all encoder/decoder tests pass.

---

## Task 3: Wire the helpers into `pathFor()` and `list()`

**Files:**

- Modify: `src/persistence/FsSnapshotStore.ts:56-60` (list) and `:76-78`
  (pathFor).

- [ ] **Step 1: Update `pathFor()`.**

Replace:

```ts
private pathFor(key: string): string {
  return `${this.directory}${this.sep}${sanitizeKey(key)}.json`;
}
```

With:

```ts
private pathFor(key: string): string {
  return `${this.directory}${this.sep}${encodeKey(key)}.json`;
}
```

- [ ] **Step 2: Update `list()`.**

Replace:

```ts
async list(): Promise<readonly string[]> {
  await this.ensureDir();
  const entries = await this.fs.readdir(this.directory);
  return entries.filter((e) => e.endsWith('.json')).map((e) => e.slice(0, -5));
}
```

With:

```ts
async list(): Promise<readonly string[]> {
  await this.ensureDir();
  const entries = await this.fs.readdir(this.directory);
  return entries
    .filter((e) => e.endsWith('.json'))
    .map((e) => decodeKey(e.slice(0, -5)));
}
```

- [ ] **Step 3: Delete the old `sanitizeKey` function.**

The old:

```ts
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}
```

…is now unreferenced. Delete it.

- [ ] **Step 4: Typecheck.**

Run: `npm run typecheck`
Expected: no errors. Any dangling reference to `sanitizeKey` would surface
here.

---

## Task 4: Integration tests via `MemFs`

**Files:**

- Modify: `tests/unit/persistence/FsSnapshotStore.test.ts`

- [ ] **Step 1: Append the integration suite.**

```ts
describe('FsSnapshotStore', () => {
  it('save / load round-trips a logical key with symbols', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    const key = 'user@ex.com/nurturing 1';
    await store.save(key, snap(key));
    const loaded = await store.load(key);
    expect(loaded?.identity.id).toBe(key);
  });

  it('list() decodes encoded filenames back to logical keys', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('user/1', snap('user/1'));
    await store.save('user_1', snap('user_1'));
    await store.save('café', snap('café'));

    const keys = await store.list();
    expect(new Set(keys)).toEqual(new Set(['user/1', 'user_1', 'café']));
  });

  it('previously-colliding keys do not overwrite each other', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('user/1', snap('via-slash'));
    await store.save('user_1', snap('via-underscore'));
    await store.save('user 1', snap('via-space'));

    expect((await store.load('user/1'))?.identity.id).toBe('via-slash');
    expect((await store.load('user_1'))?.identity.id).toBe('via-underscore');
    expect((await store.load('user 1'))?.identity.id).toBe('via-space');
  });

  it('delete() removes the encoded filename and keeps siblings intact', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('user/1', snap('user/1'));
    await store.save('user_1', snap('user_1'));

    await store.delete('user/1');
    expect(await store.load('user/1')).toBeNull();
    expect((await store.load('user_1'))?.identity.id).toBe('user_1');
  });

  it('delete() is idempotent on missing keys', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await expect(store.delete('never-saved')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests.**

Run: `npm test -- FsSnapshotStore`
Expected: all encoder + integration tests pass (12+ cases).

- [ ] **Step 3: Run the full suite.**

Run: `npm test`
Expected: all tests pass. No existing tests depended on the old collision
behavior (none reference `FsSnapshotStore` at all — this PR is the first
test coverage).

---

## Task 5: Changeset + commit

**Files:**

- Create: `.changeset/<random>.md`

- [ ] **Step 1: Generate the changeset.**

Run: `npm run changeset`
Choose: `agentonomous` → **patch**.

Summary line:

```
Fix: FsSnapshotStore now uses reversible percent-encoding for on-disk
filenames, so distinct logical keys always map to distinct files and
`list()` correctly decodes filenames back to original keys. Resolves
a silent data-loss bug where keys differing only by symbols/slashes/
spaces collided to the same file.

Breaking on-disk format for existing Node-side consumers: snapshots
written under the old lossy `sanitizeKey` layout will not be readable
through the new encoder. Migrate by listing old files, loading them,
and re-saving under the new scheme; or wipe the snapshot directory
if stored state is regenerable.
```

- [ ] **Step 2: Commit.**

```bash
git add src/persistence/FsSnapshotStore.ts tests/unit/persistence/FsSnapshotStore.test.ts .changeset/*.md
git commit -m "fix(persistence): reversible percent-encoding for FsSnapshotStore keys

The previous sanitizeKey replaced every non-[A-Za-z0-9._-] character
with '_', so 'user/1', 'user_1', and 'user 1' all collided to the
same file — silent data loss on save, silent key loss on list().

encodeKey/decodeKey now use percent-encoding (UTF-8 byte-wise %XX)
and are exported for direct unit testing. pathFor() encodes, list()
decodes. First dedicated test file for this store."
```

---

## Task 6: Verify + PR

**Files:** none.

- [ ] **Step 1: Full pre-PR gate.**

Run: `npm run verify`
Expected: all stages green.

- [ ] **Step 2: Push and open PR.**

```bash
git push -u origin fix/fs-snapshot-store-reversible-keys
gh pr create --base develop --title "fix(persistence): 0.9.7 FsSnapshotStore reversible key encoding" --body "$(cat <<'EOF'
## Summary
- Replace `FsSnapshotStore.sanitizeKey`'s lossy `/[^A-Za-z0-9._-]/g → '_'` substitution with exported `encodeKey` / `decodeKey` helpers using reversible percent-encoding.
- `pathFor()` encodes; `list()` decodes — logical keys survive the round trip.
- Distinct logical keys (`'user/1'`, `'user_1'`, `'user 1'`) now map to distinct files.
- First dedicated test file for this store: `tests/unit/persistence/FsSnapshotStore.test.ts` — 12 tests covering round-trip, collision avoidance, and save/load/list/delete integration via an in-memory `FsAdapter` stub.

**Breaking for Node-side consumers with existing snapshots.** On-disk files written under the previous layout cannot be read through the new encoder. Documented in the changeset; migration is "re-save" or "wipe and regenerate" — no automated migration shipped.

Addresses remediation plan Workstream 3.

## Test plan
- [ ] `npm run verify` green locally.
- [ ] Encoder/decoder round-trip for safe set, symbols, UTF-8, percent itself, spec-unreserved chars.
- [ ] Previously-colliding keys produce distinct files.
- [ ] Save/load/list/delete round trip via an in-memory `FsAdapter`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After merge — local cleanup.**

```bash
git switch develop
git pull origin develop
git branch -d fix/fs-snapshot-store-reversible-keys
git fetch --prune origin
```

---

## Risks & escape hatches

| Risk                                                                               | Mitigation                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing on-disk snapshots become unreadable                                       | Documented breaking change. Pre-1.0 library. No Node-side consumers known to depend on persistent cross-version storage. If such a consumer surfaces post-merge, ship a follow-up PR with a one-time migration helper (read via old sanitize, re-save via new encode, delete old file).                                                                               |
| Encoded filenames exceed OS path length limits                                     | Worst case: every char becomes `%XX` — 3× expansion. On Linux (NAME_MAX=255), keys up to ~85 chars fit; on Windows (260-char full path), directory depth matters more than filename. Not a regression — the old sanitizer just truncated invisibly via collision. Document the upper bound in a code comment on `encodeKey` if a test for long-key behavior is added. |
| Windows reserved filenames (CON, PRN, AUX, NUL, COM1…) collide with keys           | Same issue existed pre-fix — `encodeKey("CON")` returns `"CON"` (all-alphanumeric), which Windows refuses to open as a filename. Out of scope for this PR. If encountered, raise as a follow-up for a broader Windows-safe encoding layer.                                                                                                                            |
| UTF-8 byte-wise escaping of multi-byte chars interacts badly with some filesystems | ext4/APFS/NTFS all tolerate `%XX` sequences as literal filename bytes. `decodeURIComponent` correctly reassembles multi-byte chars. Test coverage includes a `café` case; add more exotic cases if a test harness reveals issues.                                                                                                                                     |
| `export`-ing `encodeKey` / `decodeKey` widens the public API surface               | Intentional — makes them directly unit-testable and reusable. If this is objectionable, move them to a private module under `src/persistence/internal/` and import into `FsSnapshotStore.ts`; re-export only if a consumer asks.                                                                                                                                      |

## Out of scope (hard — if any of these appears during execution, stop and defer)

- Migration helper for old-format snapshots. The changeset documents the
  break; no automated migration.
- Similar fixes to `LocalStorageSnapshotStore` or `InMemorySnapshotStore`.
  Neither uses filesystem sanitization — out of scope.
- Extending `FsAdapter` with new methods. The existing surface is
  sufficient.
- Windows reserved-name handling (CON, PRN, etc.). Separate concern.
- Path-length caps / key-length validation. Separate concern.
- Switching to base64url or other encoding. Percent-encoding is a
  deliberate choice documented in Architecture.
