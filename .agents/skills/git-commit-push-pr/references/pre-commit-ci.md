# Pre-commit CI validation

Use this before a task commit, or before pushing already-committed work. The goal is to catch the failures the repository's automatic CI would catch, before publishing them. Do not run deployment, production migrations, cloud authentication or post-push CI watch.

## Resolve the actual checks

Read the candidate's `.github/workflows/` and any local actions, scripts, Dockerfiles and package commands they invoke. Apply trigger/path/matrix conditions to the intended PR diff. Include required checks supplied by external CI when configured and locally reproducible. If CI is absent, retain the repository's applicable validation; do not invent this project's Docker checks in another repository or an isolated test fixture.

In this repository the current automatic checks are:

- `.github/workflows/deploy-runner-quality.yml`: build `Dockerfile.deploy` from an immutable source snapshot (`npm ci` and Prisma generation are part of the image build); run `npm test` and `npm run typecheck` inside that image with `--network none`; run `npm run test:migration-schema:db` against a fresh isolated PostgreSQL 17 on an internal network; run the same production dependency audit with its registry, flags and bounded retry policy.
- `.github/workflows/plan-artifact-guard.yml`: `npm run plans:guard` against the intended index.

The workflows remain authoritative: update the check list from current files, including newly added checks. Native macOS tests do not replace the Linux deploy image; a Next.js application build is required only if current CI requires it. Match CI's platform/architecture as well as its pinned image and dependency lockfile. Do not change Colima resources or restart another task's runtime automatically.

## Validate what will be committed

1. Inspect scope and stage explicit task paths first. Run the plan guard against this index. Capture `git write-tree` and the selected base OID. An index tree is a snapshot, not a branch commit; no commit hook is bypassed.
2. Export that tree into a task-owned temporary directory (for example `git archive <tree> | tar -x -C <owned-directory>`). Build from this snapshot, never from a dirty checkout or a directory containing `.env`, local plans, node_modules or other untracked files. Preserve the user's index and worktree. Read-only results from earlier in the task are reusable only if they prove the same candidate and CI environment; a host-only or smaller test suite leaves missing checks to run.
3. PR CI uses the synthetic merge with the base ([GitHub pull_request documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)). If the selected base has advanced, also validate a conflict-free prospective merge in an isolated temporary repository/index. A temporary commit object from `git commit-tree` and `git merge-tree --write-tree` may model the candidate without moving the topic or changing the user's index. Do not merge/rebase the source branch or resolve conflicts automatically. If this cannot be reproduced, disclose it as an incomplete required check and stop; propose base synchronization or conflict resolution for the user's next instruction. Base-only history with an identical validation tree needs no second run.
4. Execute the resolved workflow commands with their environment and exit semantics. Adapt GitHub metadata to local synthetic values; do not claim a locally synthesized commit is the PR merge SHA. Use the frozen candidate workflow/commands, and inspect relevant base changes as well. Do not copy privileged `workflow_dispatch` jobs into this preflight.
5. Use unique task-owned image/container/network names and explicit ownership labels. No host application/DB mounts, published DB ports, real credentials or external data. Use the workflow's internal DB network and synthetic credentials. Preserve shared volumes, other projects and existing servers. Clean up only verified resources created by this run, including on failure/interruption. Registry/network failures are not successful audits; use bounded diagnostics/retries and report the unmet prerequisite.
6. After a repair, restage only intended paths, capture the new tree and rebuild/revalidate invalidated checks. Before commit, ensure the index still matches the validated tree; before push, ensure the committed tree still matches it. Relevant hook or concurrent edits invalidate the result. Do not create a failing task commit merely to obtain a SHA.

## Repair or stop

Judge by behavior and impact, not line count. A missing `prototype-tsx-transfer` list entry is minor if the scenario is correctly registered and the strict inventory assertion remains. An import/type typo or a local bug preserving the agreed behavior can also be repaired. A migration checksum mismatch must not be fixed by rewriting applied history or blindly refreshing a hash. Inspect the approved history and current intent first.

Do not skip assertions, weaken audit thresholds, use `npm audit fix --force`, disable workflows, edit test drivers to hide failures, or broaden dependencies/permissions just to pass. When the needed repair is major or uncertain, preserve edits and stop before commit/push. State:

- Which check failed, its direct cause, and the affected behavior/files.
- Whether any commit/push/PR mutation happened and what work remains preserved.
- The recommended fix, its scope and tradeoff, plus a concrete alternative when useful.

After successful local validation, continue scoped commit, non-force push, PR update and one status readback. Do not call `gh pr checks --watch`, wait for runs, or poll for green. Local preflight cannot guarantee remote success after base changes or transient infrastructure failures; report local and remote evidence separately.
