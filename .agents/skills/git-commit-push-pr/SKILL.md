---
name: git-commit-push-pr
description: "Ship already-implemented current-task changes with local git and the GitHub CLI: create a topic branch when needed, stage only the intended files, commit, synchronize with the PR base, push, and create or minimally update the pull request. Use only when explicitly invoked as $git-commit-push-pr; do not use for implementation or PR merging."
---

# Git Commit Push PR

Complete the shipping workflow in the current agent with shell `git` and direct `gh` commands. Do not delegate it to a custom agent or use a GitHub plugin, connector, MCP server, or a language-runtime wrapper around `gh`.

## GitHub CLI and tmux fallback

Run `command -v tmux` before starting a fallback session. If tmux is missing, stop GitHub mutations and tell the user how to install it: macOS with Homebrew: `brew install tmux`; Debian/Ubuntu: `sudo apt-get update && sudo apt-get install tmux`; Fedora/RHEL: `sudo dnf install tmux`. Do not install packages or request pasted tokens from this skill.

When the authenticated terminal and the agent shell expose different keychains or SSH agents, create a uniquely named session (`kn-gitship-YYYYMMDD-HHMMSS`) with the repository as its working directory. Run `gh auth status`, `gh repo view`, every PR mutation, and every PR readback in that same session. Keep it alive through SHA/OID readback, then send `C-c`, confirm the pane exits, and kill only that task-owned session (never `tmux kill-server`). Report the session name, log status, and attach/stop commands.

## Invocation contract

An explicit `$git-commit-push-pr` invocation authorizes these actions for the current task only:

- create a topic branch when the current branch is protected or a detached HEAD passes the validated-adoption gates below
- stage the current task's files and create one commit when uncommitted work exists
- fetch and synchronize with the pull request base
- push the topic branch and create or update its pull request

It does not authorize force pushing, stashing or discarding changes, broad staging, resolving conflicts automatically, creating a fork, merging the pull request, or waiting for CI; it also never authorizes deleting a plan. Honor any narrower instruction in the invoking prompt. A canonical plan uses the two-stage protocol below: this first invocation archives and verifies the goal, then stops for an explicit `$plan-finalize` handoff. Only a verified `$plan-finalize` continuation handoff permits the later push/PR path after cleanup.

A recovery prompt emitted by this skill and sent back by the user may additionally authorize the exact base, new branch, task paths, staged-patch decision, and inherited commits written in that prompt. It may authorize `git restore --staged -- <explicit paths>` only for paths that the prompt names as excluded from the task. This index-only normalization never authorizes `--worktree`, hunk guessing, or modification or loss of working-tree content.

## 1. Read rules and inspect state

Before any Git write or GitHub mutation:

1. Read the applicable `AGENTS.md`, `CLAUDE.md`, repository Git rules, and pull request template. Inspect the last 10 commits and, when available, recent pull requests for established language and formatting.
2. Confirm the repository, current branch or detached state, worktrees, working tree, index, remotes, and in-progress operations with read-only Git commands. Stop for an unresolved index or an active merge, rebase, cherry-pick, or revert. A detached HEAD continues to section 2 without changing a ref or the index.
3. Resolve the GitHub remote. Prefer the current branch's upstream remote; otherwise use `origin` only when it is the single unambiguous GitHub remote. Stop rather than guessing among multiple plausible remotes.
4. Run `gh --version`, `gh auth status` for the remote host, and `gh repo view` to prove that the GitHub repository matches the Git remote. Capture `OWNER/REPO` and pass it explicitly to every later `gh` command. A first failure from a sandboxed command is inconclusive when blocked network or credential-store access could produce the same authentication or connection error. In that case, use the shell tool's approval or sandbox-escalation mechanism to rerun the same read-only preflight once outside the sandbox. If the user's authenticated terminal succeeds while the agent shell does not (keyring, SSH agent, or network-shaped failure), create a task-owned tmux session in the repository and run the preflight and all later `gh` commands in that same session; do not infer invalid authentication and never request pasted tokens. Record the session name and stop it after readback. Do not report an invalid token from the sandboxed output alone; treat the escalated or tmux result as authoritative. If escalation/tmux is unavailable or the authoritative preflight still shows failed authentication, missing access, repository mismatch, or an API/network failure, stop. Do not install, log in, expose or replace a token, fork, or reinterpret a failed lookup as "no pull request".
5. Fetch the chosen remote with pruning before deciding the base or branch state. If a fetch fails specifically because network, DNS, SSH agent, credential-store, or sandbox access is unavailable, rerun that exact read-only fetch once through the available approval or sandbox-escalation mechanism. A semantic Git rejection or a second failure is a blocker.

Preserve the initial status so the final report can distinguish task changes from unrelated user changes. Before any branch or index mutation, capture the full HEAD SHA, local and remote refs, `git worktree list --porcelain`, and one `node scripts/validation-digest.mjs --scope <task-path>` result for the proposed paths. It records staged, unstaged, untracked, scope, and validated diff digests without diff content; never put credentials, tokens, environment values, or personal data in a recovery prompt.

Resolve a canonical goal before any branch or index mutation. Generated plan artifacts are visible untracked paths, not dirty task source and not stage candidates. If the current task has a canonical goal, require it to be a regular `plans/<slug>/goal.md`, capture its bytes, SHA-256, user-check handoff, and top-level plan inventory, and stop if another plan entry is present. Independently classify the diff as UI or non-UI. For current UI work, resolve the exact completed run and execute `node .agents/skills/plan/scripts/parity-runner.mjs verify-run plans/<slug>/prototype --run-id <run-id>`. Missing, failed, stale, or ambiguous schema-version-6 final model evidence (schema-version-5 for an existing legacy matrix) stops before branch, index, remote, or pull-request mutation. For model evidence 6, require the public reader to recompute and pass all cases, child obligations, original criteria, proof/consumer links, required tuples, artifact conditions, and cleanup. For legacy matrix evidence 5, require `automationCoverageStatus=pass`, complete `interactionCoverage`, and all `auditStatus` fields equal `pass`; allow `humanVisualApprovalStatus=pending` and coverage-mode `fullParityStatus=not-run` without upgrading either status. Stage receipts and plan smoke never satisfy this gate.

## 2. Resolve the base and topic branch

For a named current branch, resolve the base in this order:

1. the `baseRefName` of the single open pull request for the current branch
2. `main`, `develop`, or the GitHub default branch when that protected branch is the branch from which this workflow starts
3. `branch.<current>.gh-merge-base`
4. the GitHub default branch

Require the remote base ref to exist and the head and base names to differ. Stop if multiple open pull requests or conflicting base candidates make the result ambiguous. Preserve an existing pull request's base; never change it automatically.

Before creating or switching branches, identify the proposed current-task paths without changing the index and apply the staging-scope guards in section 3. If existing staged content is unrelated or ambiguous, stop on the original branch without creating a local ref.

If the current branch is `main`, `develop`, or the GitHub default branch, create a topic branch before staging. First ensure the protected branch has no local-only commits that would leak into the pull request.

Follow an explicit repository branch convention. If none exists, choose the narrowest matching prefix:

- `feature/<slug>` for new behavior
- `fix/<slug>` for an ordinary defect correction
- `hotfix/<slug>` only for an explicitly urgent production correction
- `docs/<slug>`, `refactor/<slug>`, `test/<slug>`, `chore/<slug>`, or `ci/<slug>` for those scopes

Use a concise English lowercase kebab-case slug. Validate it with `git check-ref-format --branch`, then check local refs, remote refs, and `git worktree list --porcelain`. Stop for both inferred and user-specified name collisions instead of silently selecting a suffix. Find the first `-2`, `-3`, and so on that is unused across local refs, remote refs, and worktrees, and include that exact alternative in the recovery prompt.

Stay on an existing non-protected topic branch instead of stacking another branch.

### Adopt a detached HEAD when unambiguous

After remote and GitHub identity verification and the first fetch, resolve a detached HEAD without guessing:

1. If the current invocation or a valid recovery prompt explicitly names a base, require that exact remote ref. Otherwise enumerate the distinct existing `main`, `develop`, and GitHub default refs for which `git merge-base --is-ancestor HEAD <remote>/<base>` succeeds.
2. Automatically continue only when there is exactly one candidate, HEAD is in that base's history, the task paths and staged scope are unambiguous, and the proposed topic name is absent from local refs, remote refs, and every worktree.
3. If `main` and `develop` remain distinct viable candidates, stop without mutation and emit one complete recovery prompt for each base. Each prompt must contain concrete values and no choice placeholder.
4. If HEAD is not an ancestor of a protected base, inspect base-relative commits plus local and remote refs containing HEAD. Stop without mutation and offer every viable concrete choice: a stacked pull request based on an existing remote source topic, and at least one protected-base choice that explicitly lists every inherited full commit SHA and subject the pull request will contain. Do not claim a source branch is viable unless it exists remotely.
5. When every gate passes, create and switch transactionally with `git switch -c <topic> HEAD`. Never use `-C`, `--force`, `--discard-changes`, `--merge`, `--ignore-other-worktrees`, or switch to an existing branch. Verify that HEAD, the working tree, and the index still match the captured snapshot and that only the current branch identity changed, then continue to section 3.

### Stop with a self-contained recovery prompt

For a conflicting base, inherited topic history, branch-name collision, branch occupied by another worktree, or ambiguous staged scope, make no branch, index, remote, or GitHub mutation. Report the blocker and preserved state, then add `次に送るプロンプト` with one fenced block per viable choice. Every block must be independently sendable and include:

- an explicit `$git-commit-push-pr` invocation
- the GitHub `OWNER/REPO` and remote name
- the expected full HEAD SHA and detached state
- the selected base name and captured remote base OID
- one validated, currently unused topic branch name
- the exact current-task path allowlist
- the staged paths and staged binary-patch digest
- an index policy that either accepts the current staged patch or lists the exact excluded paths allowed for `git restore --staged --`
- for inherited topic history, the stacked base or every accepted head-only commit's full SHA and subject
- an instruction to continue through commit, synchronization, non-force push, pull-request creation or minimal update, and final readback without asking again about the resolved blocker
- confirmation that force pushing, force-creating, shared worktree checkout, stashing, discarding, broad staging, automatic conflict resolution, forking, merging, and CI waiting remain unauthorized

For a branch occupied by another worktree, include the occupying path in the report but propose an unused new branch from the current HEAD; never move or share the occupied branch. For an ambiguous staged set, offer only choices supported by the observed patch: accept the exact current staged patch, or unstage exact excluded paths. When one file mixes task and non-task hunks, an executable choice may accept the captured staged patch as the task patch; never infer a different hunk selection.

On a recovery invocation, rerun every read-only preflight from the beginning. Require repository identity, HEAD, base OID, branch existence, worktree occupancy, staged paths, and staged digest to match the prompt. If they match, treat its base, branch, path, index, and history values as the user's explicit decision and do not stop again for the same ambiguity. If its index policy excludes paths, run `git restore --staged -- <explicit excluded paths>` once, verify working-tree contents were preserved and the index now matches the task allowlist, then continue. If any captured value drifted, apply none of the prompt and stop with current evidence and a replacement prompt where a viable user choice can resolve the new state.

A recovery prompt resolves only its named blocker. Authentication, network or API failure, hook failure, conflict, remote divergence, base-update race, or any newly discovered independent safety condition still stops the workflow.

## 3. Select, validate, and commit the task changes

Determine the exact current-task paths from the invocation context and the actual diff.

- Preserve an existing intended staged set.
- If unrelated changes are already staged or task and non-task paths cannot be separated confidently, stop before changing the index and use the recovery-prompt contract above.
- If one file contains both task and unrelated hunks, stop rather than staging the whole file. A recovery prompt may preserve the exact captured staged patch when the user explicitly accepts it, but it never selects different hunks.
- Stage with `git add -- <explicit paths>`. Never use `git add .`, `git add -A`, `git commit -a`, or a broad glob.
- Exclude credentials, tokens, `.env*`, machine-local files, and unrelated generated artifacts unless the user explicitly put them in scope.

Before committing, record the current HEAD, inspect both `git diff --cached --name-status` and the complete staged patch, and rerun the digest helper after limited staging. If its validated diff digest matches the recorded implementation/review result, reuse those successful command/scope/status records and run only `git diff --cached --check` plus repository hooks; otherwise run the missing changed-scope validation first. Record only commands that actually ran and their results.

Generate the commit subject only from the staged diff. Follow repository conventions first; otherwise use a concrete Japanese Conventional Commit subject without a trailing period. When a canonical current-task goal exists, create a private repository-external message file with `node scripts/plan-commit-archive.mjs prepare --goal plans/<slug>/goal.md --subject <subject> --output <temporary-file>`, verify its recorded path, byte length, and SHA-256, then commit with `git commit --cleanup=verbatim -F <temporary-file>`. This preserves the complete UTF-8 goal payload, including Markdown headings and its final newline. Never summarize, reformat, truncate, or redact the payload; stop before commit if secret or size validation fails. Do not add AI attribution or `Co-authored-by`.

If task changes are already committed but a canonical goal remains unarchived, require a real base-relative task diff and create exactly one final archive commit with `git commit --allow-empty --cleanup=verbatim -F <temporary-file>`. Do not create an empty archive commit when the same goal SHA-256 already appears in the current base-relative history.

Let commit hooks run. Never use `--no-verify`. If a hook fails, stop unless it changed only intended files in a clearly mechanical way; in that case inspect and restage those explicit paths and retry once. Stop if a hook touches unrelated files or the retry fails.

After committing, verify that HEAD advanced, the index is empty, and the hash, subject, and paths are correct with `git show --stat --oneline --no-renames HEAD`. For an archived goal, also run `node scripts/plan-commit-archive.mjs verify-commit --commit HEAD --goal plans/<slug>/goal.md` and require raw commit-object payload equality. If a hook included an unexpected path or changed the archive, stop before push instead of amending or resetting automatically. If neither a task commit nor a base-relative diff exists, stop without pushing or creating a pull request. Delete only the task-owned temporary message on every success or failure path.

## 4. Canonical-plan archive handoff

When a canonical goal is present, stop after section 3 has created the archive commit and `verify-commit` has proven raw payload equality. Do not fetch again, synchronize, clean up, push, or create/update a pull request in this invocation. Require an empty index and preserve the complete plan directory unchanged.

Emit one self-contained `$plan-finalize` handoff in a fenced block. Include repository root, remote, branch, current HEAD, base ref and fetched base OID, canonical goal path, exact goal SHA-256, verified archive commit SHA, and complete top-level plan inventory. State that the user must explicitly resend this exact handoff to `$plan-finalize`, that it alone may synchronize and perform the constrained cleanup, and that no remote or PR mutation has occurred. Never turn this into a generic recovery prompt or infer permission to finalize from archive history alone.

## 5. Post-finalize continuation for a removed canonical plan

When no canonical goal is on disk but `plans/` is template-only, proceed to push/PR only if the user explicitly sends a complete continuation handoff emitted by `$plan-finalize`. Revalidate repository root, remote, branch, post-cleanup HEAD, base ref/OID, resolved archive SHA, goal path/SHA-256, template-only inventory, successful `plans:guard`, and clean index. Run `node scripts/plan-commit-archive.mjs verify-history --base <remote-base-oid> --head HEAD --require-goal-sha256 <goal-sha256>` and require the resolved archive occurs exactly once in `<remote>/<base>..HEAD` for the named goal SHA-256. Any mismatch, absent handoff, untracked plan artifact, or guard failure stops before synchronization, push, or PR mutation.

Read and apply [the shared base synchronization contract](references/base-sync-contract.md). If synchronization changes `HEAD`, revalidate the archive once in the new `<remote>/<base>..HEAD` history; no cleanup is ever performed here. Immediately before push, require the current branch is not protected, `<remote>/<base>` is an ancestor of `HEAD`, `git rev-list --left-right --count <remote>/<base>...HEAD` has zero base-only and at least one head-only commit, `git diff --quiet <remote>/<base>...HEAD --` reports a real pull-request diff, the remote topic has not advanced, and `plans/` remains regular tracked `plans/template.md` only.

## 6. Standard non-plan synchronization

For a task with no canonical goal and no `$plan-finalize` continuation handoff, read and apply [the shared base synchronization contract](references/base-sync-contract.md), then require the same pre-push ancestry, diff, remote-topic, and template-only-plan checks. This preserves the existing shipping behavior for ordinary tasks.

## 7. Push without rewriting history

Push an unpublished branch with an explicit upstream and refspec. Push an existing branch with an explicit remote and `HEAD:refs/heads/<branch>` refspec. Never use `--force`, `--force-with-lease`, or retry a non-fast-forward rejection by rewriting history.

If a push returns a network, DNS, SSH agent, credential-store, or sandbox-shaped failure, do not immediately repeat the mutation. First query the exact remote topic ref through the approval or sandbox-escalation mechanism. If it already equals local `HEAD`, treat the push as applied. If it does not exist or still points to the previously recorded SHA, retry the exact push once through that mechanism. After an ambiguous retry, query the remote ref again and report the observed state without a second mutation retry. Never apply this retry path to a non-fast-forward, hook, policy, or other semantic rejection.

After push, verify that local `HEAD` equals the remote branch SHA returned by Git. A rejected or unverifiable push is a partial result, not success.

## 8. Create or minimally update the pull request

List open pull requests for the exact head branch and repository owner after push. Treat zero, one, and multiple results distinctly.

### No open pull request

Build the title and body only from:

- `<base>...HEAD` diff
- `<base>..HEAD` commits
- validations actually executed in this workflow or reliably recorded in the current task
- the repository pull request template and applicable repository instructions

Use the canonical goal handoff captured before verified cleanup only to transfer its unambiguous `## ユーザー動作確認`; it does not broaden the PR change scope. For planned work, record the goal archive commit SHA and goal SHA-256 under automated confirmation instead of presenting the deleted local evidence path as a durable link. Copy every applicable stable `UI-CHECK-XX` item into `### ユーザー動作確認` as unchecked. Never mark a user check complete from static validation, prototype smoke, automated coverage, or an agent statement. When a small UI diff has no canonical goal, derive the minimum concrete unchecked checks from the actual diff and use `未確認 / 後続確認` for any prerequisite or expected result that cannot be proven. For a non-UI diff, write `- 対象外: UI変更なし`. Under `### 自動確認`, list only commands actually run and their observed results; keep manual checks out and do not present an unchecked item as a failed automated test.

When a Codex thread or session ID is available and repository instructions do not forbid it, include a single `## Codex セッション` section with `codex resume <id>`.

For a one-commit pull request, normally use the commit subject as the title. Use `gh pr create` with explicit repository, `--base`, `--head`, `--title`, and body input. Do not use `--dry-run` as a safety check because it can still push. If creation fails, search again before any retry so an ambiguous response cannot create a duplicate pull request. For a sandbox-shaped failure, perform that search through the approval or sandbox-escalation mechanism; if no matching pull request exists, retry the exact create command once through the same mechanism. After an ambiguous retry, search once more and report the observed state without another create attempt. Create a new UI pull request as Draft whenever a required `UI-CHECK-XX` item remains unchecked. Otherwise create a ready pull request only when required local validation passed and there are no known follow-ups; when either condition is false, add `--draft` and state what remains unverified.

### One open pull request

Pushing already updates its commits. Read the existing title and body, then use `gh pr edit` only when the actual diff, commits, validation results, or required user checks make specific content stale. Preserve manual notes, unrelated sections, the existing base, the draft/ready state, Codex session entries from other sessions, and the checked/unchecked state of every existing `UI-CHECK-XX` item. Match checklist items by stable ID: update only stale wording, append newly required IDs unchecked, and never silently uncheck or delete an existing item. Do not switch draft/ready state automatically. Add or update only the current session entry when its ID is available. Do not add a noisy update comment when no metadata edit is needed. If an edit has a sandbox-shaped or ambiguous failure, reread the pull request through the approval or sandbox-escalation mechanism. Retry the exact edit once only when the intended metadata is still absent; after another ambiguous result, reread and report without further mutation.

### Multiple open pull requests

Stop and report the candidates. Do not choose one heuristically. Do not run or wait for CI as part of this skill.

## 9. Verify GitHub state and report

Use one `gh pr view --json` call to verify at least the pull request number, URL, base/head names and OIDs, draft state, `mergeable`, and `mergeStateStatus`, and compare its base OID with the pre-push base SHA. Do not poll or wait for a value that is temporarily unavailable; report that field as unverified.

- `CONFLICTING` or `DIRTY`: report failure; do not call the workflow complete.
- unresolved `UNKNOWN`: report mergeability as unverified.
- `BEHIND` or a changed base OID: report a base-update race and do not describe the branch as fully synchronized.
- `BLOCKED`, `UNSTABLE`, and `DRAFT`: report separately from merge conflicts and never describe them as CI success or merge-ready.

Confirm that local HEAD, the pushed remote SHA, and the pull request head OID match. Finish with a compact report of:

- branch and base
- commit hash and subject, or that no new commit was needed
- validation commands and results
- push result and remote SHA
- pull request URL and whether metadata changed
- mergeability and merge-state result
- any unrelated working-tree changes preserved

Never present commit, goal archival, plan finalization, push, pull request creation/update, or mergeability as interchangeable completion states. Preserve unrelated artifacts; plan deletion belongs only to `$plan-finalize`.

Use [the fidelity contract](../plan/references/fidelity-audit.md) when validating current UI evidence. Missing/failed/stale CLI results, feasible t-way tuples, real-action steps, requirement mappings, or Codex visual inspection prevent completion even when axis coverage passes. Never convert historical schema 4 evidence into schema 5 or infer inspection from screenshot existence. Preserve optional human checklist status.

新規UIのcontract version 3 / profile version 5、Browser前のestimate、consumer接続、段階集約のschema 6、`goal-clarification.mjs`による限定承認継承は[共通検証契約](../plan/references/workflow-verification-contract.md)に従う。
