---
name: git-commit-push-pr
description: "Ship already-implemented current-task changes with local git and the GitHub CLI: create a topic branch when needed, stage only the intended files, commit, synchronize with the PR base, push, and create or minimally update the pull request. Use only when explicitly invoked as $git-commit-push-pr; do not use for implementation or PR merging."
---

# Git Commit Push PR

Complete the shipping workflow with shell `git` and direct `gh` commands. Do not use a GitHub plugin, connector, MCP server, or a language-runtime wrapper around `gh`.

## Invocation contract

An explicit `$git-commit-push-pr` invocation authorizes these actions for the current task only:

- create a topic branch when the current branch is protected
- stage the current task's files and create one commit when uncommitted work exists
- fetch and synchronize with the pull request base
- push the topic branch and create or update its pull request

It does not authorize force pushing, stashing or discarding changes, broad staging, resolving conflicts automatically, creating a fork, merging the pull request, or waiting for CI. Honor any narrower instruction in the invoking prompt.

## 1. Read rules and inspect state

Before any Git write or GitHub mutation:

1. Read the applicable `AGENTS.md`, `CLAUDE.md`, repository Git rules, and pull request template. Inspect the last 10 commits and, when available, recent pull requests for established language and formatting.
2. Confirm the repository, current branch, worktrees, working tree, index, remotes, and in-progress operations with read-only Git commands. Stop for a detached HEAD, unresolved index, or an active merge, rebase, cherry-pick, or revert.
3. Resolve the GitHub remote. Prefer the current branch's upstream remote; otherwise use `origin` only when it is the single unambiguous GitHub remote. Stop rather than guessing among multiple plausible remotes.
4. Run `gh --version`, `gh auth status` for the remote host, and `gh repo view` to prove that the GitHub repository matches the Git remote. Capture `OWNER/REPO` and pass it explicitly to every later `gh` command. A first failure from a sandboxed command is inconclusive when blocked network or credential-store access could produce the same authentication or connection error. In that case, use the shell tool's approval or sandbox-escalation mechanism to rerun the same read-only preflight once outside the sandbox. Do not report an invalid token from the sandboxed output alone; treat the escalated result as authoritative. If escalation is unavailable or the escalated preflight still shows failed authentication, missing access, repository mismatch, or an API/network failure, stop. Do not install, log in, expose or replace a token, fork, or reinterpret a failed lookup as "no pull request".
5. Fetch the chosen remote with pruning before deciding the base or branch state. If a fetch fails specifically because network, DNS, SSH agent, credential-store, or sandbox access is unavailable, rerun that exact read-only fetch once through the available approval or sandbox-escalation mechanism. A semantic Git rejection or a second failure is a blocker.

Preserve the initial status so the final report can distinguish task changes from unrelated user changes.

## 2. Resolve the base and topic branch

Resolve the base in this order:

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

Use a concise English lowercase kebab-case slug. Validate it with `git check-ref-format --branch`, then check local refs, remote refs, and `git worktree list --porcelain`. For an inferred name collision, append `-2`, `-3`, and so on; for a user-specified name collision, stop and report it.

Stay on an existing non-protected topic branch instead of stacking another branch.

## 3. Select, validate, and commit the task changes

Determine the exact current-task paths from the invocation context and the actual diff.

- Preserve an existing intended staged set.
- If unrelated changes are already staged or task and non-task paths cannot be separated confidently, stop before changing the index.
- If one file contains both task and unrelated hunks, or an intentional partial stage cannot be preserved safely, stop instead of staging the whole file.
- Stage with `git add -- <explicit paths>`. Never use `git add .`, `git add -A`, `git commit -a`, or a broad glob.
- Exclude credentials, tokens, `.env*`, machine-local files, and unrelated generated artifacts unless the user explicitly put them in scope.

Before committing, record the current HEAD, inspect both `git diff --cached --name-status` and the complete staged patch, and run `git diff --cached --check` plus validations required by repository rules or the changed scope. Record only commands that actually ran and their results.

Generate the commit message only from the staged diff. Follow repository conventions first; otherwise use a concrete Japanese Conventional Commit subject without a trailing period. Do not add AI attribution or `Co-authored-by`.

Let commit hooks run. Never use `--no-verify`. If a hook fails, stop unless it changed only intended files in a clearly mechanical way; in that case inspect and restage those explicit paths and retry once. Stop if a hook touches unrelated files or the retry fails.

After committing, verify that HEAD advanced, the index is empty, and the hash, subject, and paths are correct with `git show --stat --oneline --no-renames HEAD`. If a hook included an unexpected path, stop before push instead of amending or resetting automatically. If there are no uncommitted task changes but the topic branch already has commits relative to the base, skip the empty commit and continue. If neither a task commit nor a base-relative diff exists, stop without pushing or creating a pull request.

## 4. Synchronize with the latest base before push

Fetch the remote again immediately before synchronization. Check both the topic branch's remote ref and `<remote>/<base>`.

- **Unpublished topic branch:** require a clean working tree for integration, then run `git rebase --no-autostash <remote>/<base>`.
- **Published topic branch:** determine publication from the remote ref, not merely upstream configuration. If the remote topic has commits not contained in local HEAD, stop for remote divergence. Otherwise, when the base is not already an ancestor, run `git merge --no-autostash --no-edit <remote>/<base>` without rewriting history.
- **Unrelated dirty changes remain:** if synchronization is required, stop instead of stashing or risking those changes. If the latest base is already an ancestor, the unrelated changes may remain while shipping the scoped commit.

On a rebase or merge conflict, capture `git diff --name-only --diff-filter=U`, abort the operation, confirm the pre-integration state is restored, and stop without pushing. Do not resolve or retry automatically.

Immediately before push, require all of the following:

- the current branch is not protected
- `<remote>/<base>` is an ancestor of `HEAD`
- `git rev-list --left-right --count <remote>/<base>...HEAD` reports zero base-only commits and at least one head-only commit
- `git diff --quiet <remote>/<base>...HEAD --` reports a real pull request diff
- when supported, `git merge-tree --write-tree <remote>/<base> HEAD` reports no conflict
- the remote topic SHA has not advanced since the divergence check

## 5. Push without rewriting history

Push an unpublished branch with an explicit upstream and refspec. Push an existing branch with an explicit remote and `HEAD:refs/heads/<branch>` refspec. Never use `--force`, `--force-with-lease`, or retry a non-fast-forward rejection by rewriting history.

If a push returns a network, DNS, SSH agent, credential-store, or sandbox-shaped failure, do not immediately repeat the mutation. First query the exact remote topic ref through the approval or sandbox-escalation mechanism. If it already equals local `HEAD`, treat the push as applied. If it does not exist or still points to the previously recorded SHA, retry the exact push once through that mechanism. After an ambiguous retry, query the remote ref again and report the observed state without a second mutation retry. Never apply this retry path to a non-fast-forward, hook, policy, or other semantic rejection.

After push, verify that local `HEAD` equals the remote branch SHA returned by Git. A rejected or unverifiable push is a partial result, not success.

## 6. Create or minimally update the pull request

List open pull requests for the exact head branch and repository owner after push. Treat zero, one, and multiple results distinctly.

### No open pull request

Build the title and body only from:

- `<base>...HEAD` diff
- `<base>..HEAD` commits
- validations actually executed in this workflow or reliably recorded in the current task
- the repository pull request template and applicable repository instructions

When a Codex thread or session ID is available and repository instructions do not forbid it, include a single `## Codex セッション` section with `codex resume <id>`.

For a one-commit pull request, normally use the commit subject as the title. Use `gh pr create` with explicit repository, `--base`, `--head`, `--title`, and body input. Do not use `--dry-run` as a safety check because it can still push. If creation fails, search again before any retry so an ambiguous response cannot create a duplicate pull request. For a sandbox-shaped failure, perform that search through the approval or sandbox-escalation mechanism; if no matching pull request exists, retry the exact create command once through the same mechanism. After an ambiguous retry, search once more and report the observed state without another create attempt. Create a ready pull request only when required local validation passed and there are no known follow-ups; otherwise add `--draft` and state what remains unverified.

### One open pull request

Pushing already updates its commits. Read the existing title and body, then use `gh pr edit` only when the actual diff, commits, or validation results make specific content stale. Preserve manual notes, unrelated sections, the existing base, the draft/ready state, and Codex session entries from other sessions; add or update only the current session entry when its ID is available. Do not add a noisy update comment when no metadata edit is needed. If an edit has a sandbox-shaped or ambiguous failure, reread the pull request through the approval or sandbox-escalation mechanism. Retry the exact edit once only when the intended metadata is still absent; after another ambiguous result, reread and report without further mutation.

### Multiple open pull requests

Stop and report the candidates. Do not choose one heuristically.

Do not run or wait for CI as part of this skill.

## 7. Verify GitHub state and report

Use `gh pr view --json` to verify at least the pull request number, URL, base/head names and OIDs, draft state, `mergeable`, and `mergeStateStatus`. Compare the pull request base OID with the base SHA used by the pre-push checks. If mergeability or an expected OID is temporarily unavailable, retry at most three times with short waits totaling no more than 30 seconds.

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

Never present commit, push, pull request creation/update, or mergeability as interchangeable completion states.
