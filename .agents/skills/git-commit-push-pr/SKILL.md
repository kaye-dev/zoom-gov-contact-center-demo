---
name: git-commit-push-pr
description: "Ship current-task changes with local git and gh: scoped commit, non-force push, and pull request creation or minimal update in one invocation. Use only when explicitly invoked as $git-commit-push-pr."
---

# Git Commit Push PR

Complete commit, push, PR creation/update, and readback in the current agent. Do not delegate to a custom agent or use a GitHub connector. Run `git` and `gh` directly from the shell.

An explicit invocation authorizes the current task's topic branch, scoped stage/commit, fetch, non-force push, and PR creation/minimal update. Respect narrower instructions such as push-only. It does not authorize force push, stash/reset, broad staging, discarding changes, plan deletion, conflict resolution, forking, PR merge, or CI waiting.

## 1. Inspect and resolve

- Read applicable AGENTS/CLAUDE rules, Git conventions, the PR template, and the last 10 commits. Capture status, HEAD, branch/detached state, worktrees, index, remotes, and active operations. Stop for an unmerged index or active merge/rebase/cherry-pick/revert.
- Resolve task paths from the request and actual diff. Preserve unrelated changes. Stop before ref/index writes when unrelated staged content or mixed hunks cannot be separated confidently. An explicit recovery instruction may allow `git restore --staged -- <excluded paths>` only; preserve working-tree contents.
- Resolve the upstream GitHub remote or unambiguous origin. Check `gh --version`, `gh auth status`, and `gh repo view` for repository/host identity; pass `--repo OWNER/REPO` explicitly in subsequent PR commands. An API/network failure is not 'no PR'. Fetch the selected remote once before branch/base decisions.
- Use an existing PR's base; do not change it automatically. For a new PR, use the base branch from which the task started, including `main` for ordinary changes started there. Determine it from the user's instruction, task-start branch, or recorded branch/worktree creation context, and verify the base-relative commits and diff match the task. Do not infer the base solely from a topic's upstream tracking ref. Ask only when the starting base cannot be identified or explicit choices conflict.
- Stay on an existing topic branch. For a protected branch or detached HEAD, create a topic from HEAD only when base-relative history and task scope are understood and contain no unapproved foreign commits. Follow repository naming, otherwise `codex/<slug>`. Check local/remote refs and worktree occupancy with `git check-ref-format --branch` and ref inspection. For a generated name collision choose an unused suffix; for a user-specified name ask for a concrete alternative. Never force-create a ref or check out a branch occupied elsewhere.
- If a detached base/history choice is unresolved, report concrete viable bases and inherited commits for user selection. Existing authorization for a choice remains valid when the current state matches; do not require a ceremonial recovery format or repeat the same question.

Authentication fallback is conditional: if the user's terminal has a working keychain/SSH agent but the agent shell does not, use a uniquely named task-owned tmux session after `command -v tmux`. Run preflight and all later gh commands in that session. On completion stop only that session and report it. Do not install tools, request pasted tokens, or bypass unavailable permissions. Report an authoritative authentication/network failure and stop dependent mutations.

## 2. Stage and commit

Generated `plans/<slug>/` directories, other plans, and local fixtures remain in place and outside the stage allowlist. Their presence is not a blocker. Only `plans/template.md` is a permitted tracked plan file. For that policy run `npm run plans:guard` after staging when applicable; it checks the index, not local directory inventory.

- Reuse implementation test/lint/typecheck/build results that still apply to the task's content. Do not rerun them by default before commit. Missing digests or parity evidence are not a gate. Known required-check failures remain failures and must not be reported as successful validation.
- When an error occurs, diagnose it and fix directly related minor issues within the task scope without another prompt, preserving intended behavior, permissions, data contracts and test strength. Recheck only what the repair affects and stage only its explicit paths. Stop and report the cause and proposed response if repair requires major changes or unresolved decisions.
- Use `git add -- <explicit paths>`. Inspect the complete staged diff and `git diff --cached --name-status`; run `git diff --cached --check`. Exclude credentials, tokens, machine-local files and unrelated generated output.
- Generate a Japanese commit from the staged diff only, following repository conventions. No AI attribution or `Co-authored-by`. If the task is already committed, proceed with that real base-relative diff; do not create an empty or archive-only commit.
- Let hooks run; never use `--no-verify`. If a hook makes clearly mechanical edits only inside the intended set, inspect/restage those paths and retry once. Stop for unrelated hook changes or another failure. Do not broaden the task to repair unrelated failures.
- Verify the created commit paths/subject and clean index. Preserve unrelated worktree content. An unexpected committed path stops push; do not amend/reset it automatically.

## 3. Push and pull request

A nonempty intended base-relative diff is required. Before push verify the current topic branch, local HEAD and remote topic ref. Stop if the remote topic contains commits not in local HEAD. Push with an explicit refspec, for example `git push -u <remote> HEAD:refs/heads/<topic>`, without force.

Base-only commits do not require integration. A PR merge conflict can be reported with a safe topic push and Draft PR. Resolve conflicts or synchronize the base only when the user requests it; then read [base-sync-contract.md](references/base-sync-contract.md). Never rebase published history.

- Query existing PRs for the exact head before creation. Create only if none exists; minimally update stale parts of an existing PR, retaining its base, human notes, checklist states and draft/ready status. A new PR with a known conflict or unverified UI is Draft.
- Write title/body from `<base>...HEAD`, `<base>..HEAD`, actual check results, and current PR metadata. Preserve the repository PR template and use Japanese. Copy applicable unchecked `UI-CHECK-XX` items, disclose UI unverified/known failures/CI state, and use `UI 変更なし` for non-UI work. A user UI checklist is not a required pre-push approval.
- Prepare multiline text in a task-owned temporary file and pass `--body-file` to direct gh commands. Keep one `## Codex セッション` section with the known `codex resume <session-id>` and preserve other session entries. Do not invent IDs. If an accurate existing body needs no update, keep it.
- Read back local HEAD, the pushed remote SHA, and PR `url`, `body`, `headRefOid`, `baseRefOid`, `mergeable`, and `mergeStateStatus` after the final PR mutation. Local HEAD, remote SHA, and PR `headRefOid` must match; `baseRefOid` identifies the selected base. Report unknown mergeability/CI state without polling or claiming success for those checks.

Finish with branch/base, commit, actual validation, push result, PR URL/update result, HEAD agreement, mergeability and preserved unrelated changes.

Before sending that final report, inspect the latest read-back PR body's 「ユーザー動作確認」 section. If any item is unchecked, read [動作確認の代行依頼プロンプト](../../../docs/development/codex-development-workflow.md#動作確認の代行依頼プロンプト) and append exactly one request using its canonical wording and the actual read-back PR URL. Use a `:codex-followup` list item in the Codex app, or copyable text elsewhere. Do not offer it when all items are checked, the section has no applicable items, or no PR was created or identified. If the final body cannot be retrieved, report its verification state as unknown and do not infer it from an earlier body or generate a request. This is a suggestion only: do not start verification, change checklist states, or perform repairs without the user's subsequent request.

## Plan and verification compatibility

Shipping uses valid focused-check and UI-smoke results under [workflow-verification-contract.md](../plan/references/workflow-verification-contract.md); it does not run Browser or detailed parity. Carry forward prototype comparison conditions, matches, accepted differences, and any `prototypeとの視覚照合は未確認` limitation. Browser unavailability is disclosed as UI unverified. A known functional/test failure or unintended design difference is not merely unverified and must be reported as a blocker unless the user explicitly accepts that exact failure for shipment.

Goal archive and cleanup are optional separate operations, not steps or handoffs in this invocation. Keep existing archives/evidence untouched. Never delete or move plan artifacts for shipping.
