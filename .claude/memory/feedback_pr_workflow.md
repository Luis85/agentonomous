---
name: PR workflow — independent branches + batch + multi-pass Codex
description: Standard per-session loop. Cut independent branches, batch open all PRs first, then sweep Codex reviews PR by PR until 👍, resolve threads, maintainer merges.
type: feedback
---

Standard workflow for every multi-PR session in this repo. Confirmed
in practice on multi-PR sessions where the batch shape consistently
beat serial PR-by-PR completion.

## The loop

1. **Independent branches per concern.** Each PR is one branch cut
   fresh from `develop`. Never stack. Never pull a later row's work
   into the earlier PR. If two branches happen to touch the same
   file, ship them separately and rebase the second after the first
   merges.
2. **Batch execution, batch open.** A session can ship multiple PRs
   in one go — implement, push, open the PR, then move on to the
   next row. Do **not** wait serially for Codex on each before
   starting the next branch. Open every independent PR the session
   covers, then switch into review-sweep mode.
3. **Multi-pass Codex resolution.** Sweep PRs in order:
   - `gh pr view <num> --comments` and
     `gh api repos/:owner/:repo/pulls/<num>/comments` to read
     line comments + their commit anchors.
   - Address real findings with a follow-up commit on the same
     branch. Push (do **not** rebase mid-review — Codex's line
     anchors break).
   - Loop until Codex posts a 👍 reaction
     (`gh api repos/:owner/:repo/issues/<num>/reactions`) on
     the latest commit. Per Codex docs: "If Codex has suggestions, it
     will comment; otherwise it will react with 👍."
   - **Skip literal re-flags** of comments already addressed by a
     code-level fix. Note the false-positive in the PR description so
     the human reviewer sees the rationale, then move on. Don't
     iterate forever on Codex's pattern-match repeats.
4. **Resolve the review threads.** Once Codex 👍s and human review
   passes, mark each conversation as **Resolved** in the GitHub PR
   review UI (or via `gh api graphql` for bulk-resolve). Codex keeps
   re-pinging open threads otherwise.
5. **Maintainer merges.** Don't merge your own PRs. After the
   merge: `git switch develop && git pull --ff-only origin develop &&
git fetch --prune origin && git branch -d <topic>`.

## Why

- Codex pattern-matching is per-line; small focused PRs get cleaner
  reviews than mixed diffs.
- Batch-opening avoids the dead time between push and Codex review
  (~5 minutes per PR). One implementation pass + one sweep pass beats
  N serial pass-pairs.
- Resolving threads keeps the PR review surface honest — unresolved
  threads imply unaddressed feedback, which inflates the apparent
  review backlog.

## Pitfalls

- **Don't `git rebase` mid-Codex-review.** It rewrites SHAs and Codex
  loses the line anchors on its own comments. Append commits instead;
  squash at merge time if needed (maintainer's call).
- **Don't merge your own PRs.** Even if Codex 👍s and tests pass,
  wait for the maintainer.
- **Don't `git push --force`** unless you and the maintainer agreed.
  Topic branches are short-lived; force-pushing them invalidates
  Codex review state.

## Reference scripts

```bash
# Bulk PR sweep — replace the PR list with the session's PR numbers
for pr in 63 64 65 66 67 68 69 70; do
  echo "===PR#$pr==="
  gh pr view "$pr" --json reviews \
    -q '.reviews | map(.author.login + " " + .state) | join(", ")'
  echo "--reactions--"
  gh api "repos/:owner/:repo/issues/$pr/reactions" \
    -q '.[] | "\(.user.login) \(.content)"'
done
```

```bash
# Fetch line comments on the latest fix commit only
gh api "repos/:owner/:repo/pulls/$PR/comments" \
  -q ".[] | select(.commit_id[0:8] == \"$SHA\") | {path, line, body}"
```
