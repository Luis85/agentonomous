---
name: Codex approval/finding signal lives in issue comments, not pull review state
description: When polling Codex review state, query issue-level comments + line-level P1/P2 comments separately — `gh pr view --json reviews` is not the signal
type: feedback
originSessionId: 97567988-a027-4521-a75a-dcd260ce4d8e
---

Codex's "Codex Review: Didn't find any major issues" approval lands as a **PR-level issue comment**, not as an `APPROVED` review state. Findings land as **line-level review comments** with P1/P2 badges in the body. Polling `gh pr view <N> --json reviews` misses both signals — it only shows `COMMENTED` review wrappers.

Use these THREE endpoints (reactions added 2026-04-26 — see incident below):

```bash
# 1. approval-by-reaction (Codex now sometimes only emoji-reacts, no comment)
gh api repos/<org>/<repo>/issues/<N>/reactions \
  --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]") | {content, created_at}'
# `+1` content = approval. Fires within ~2 min of PR open.

# 2. approval-by-comment (issue-level)
gh api repos/<org>/<repo>/issues/<N>/comments \
  --jq '[.[] | select(.user.login == "chatgpt-codex-connector[bot]")] | .[-1] | {created_at, body: .body[0:120]}'

# 3. findings (line-level, filter on P1/P2)
gh api repos/<org>/<repo>/pulls/<N>/comments \
  --jq '[.[] | select(.user.login == "chatgpt-codex-connector[bot]" and ((.body | contains("P1")) or (.body | contains("P2"))))] | .[] | {id, original_commit: .original_commit_id[0:10], created_at, body: .body[0:140]}'
```

When determining "is finding stale or new", filter line-level comments on `original_commit_id` (where Codex first posted), not `commit_id` — GitHub auto-re-anchors line comments to the latest commit, which makes a stale finding look like it's flagging the new push.

**Why:** Burned 3 cron sweeps on session 2026-04-25 polling `gh pr view --json reviews` for PRs #108/#109 — Codex had already approved both 30+ minutes earlier via "Chef's kiss" / "Keep it up!" issue comments, but the `reviews[]` array was empty/COMMENTED so the cron never registered settled state. **Then on 2026-04-26 PR #127, missed approval again** — Codex left only a `+1` emoji reaction on the PR body (no issue comment, no review). User had to point it out after 4 cron sweeps. Reactions endpoint now added above.

**How to apply:** Whenever the user asks for Codex sweep / poll / "is it approved yet", hit ALL THREE endpoints (reactions + issue-comments + pulls-comments with P1/P2 body filter). Approval signal is `(reactions has +1) OR (issue-comments contains "Didn't find" / "Chef's kiss" / similar)`. Use `original_commit_id` on line-level comments to disambiguate "still flagged on new push" from "stale anchor on prior push that's already addressed".
