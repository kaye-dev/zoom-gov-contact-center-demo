---
name: plan-finalize
description: "Synchronize one verified canonical plan archive with its base and perform constrained plan cleanup. Use only when explicitly invoked as $plan-finalize with the exact handoff emitted by $git-commit-push-pr; it never pushes or creates a pull request."
---

# Plan Finalize

Run this skill in the current agent; do not delegate to a custom agent, use a GitHub plugin, or make GitHub mutations. It has deletion authority only for the exact current slug named in a valid first-stage shipping handoff.

## Invocation and handoff validation

Accept only an explicit `$plan-finalize` invocation that includes the complete, concrete handoff emitted by the first-stage `$git-commit-push-pr`. Before any write, reread repository rules, inspect Git state and in-progress operations, resolve the remote, fetch it, and require all of these to match the handoff: repository root, remote, branch, initial HEAD, base ref, initial base OID, canonical goal path, goal SHA-256, initial archive commit SHA, and top-level plan inventory. Require the current on-disk goal to be a regular file at that exact path, its bytes and SHA-256 to match, and inventory to contain exactly `plans/template.md` plus the named real slug directory.

Verify the initial archive against the on-disk goal with `node scripts/plan-commit-archive.mjs verify-commit --commit <archive-sha> --goal <goal-path>`. Reject a changed branch, remote, goal, inventory, archive, tracked dirty state, or a foreign plan before cleanup. An active or malformed confirmation session, template drift, archive mismatch, or any ambiguity stops with zero deletions. Do not accept a handoff reconstructed from ordinary history, a later archive, or placeholders.

## Synchronize and re-resolve the archive

Read and apply [the shared base synchronization contract](../git-commit-push-pr/references/base-sync-contract.md). Preserve the canonical plan throughout synchronization. A base advance after the recorded base OID is expected; record the fetched current base OID. On every stop before cleanup—including remote divergence, collision, tracked dirtiness, or a rebase/merge conflict—abort any started integration, confirm the pre-sync snapshot, leave the plan intact, and make no push or pull-request mutation.

After synchronization, run `node scripts/plan-commit-archive.mjs verify-history --base <current-remote-base-oid> --head HEAD --require-goal-sha256 <goal-sha256>`. Parse its result and require exactly one archive with that SHA-256 and the exact goal path. The archive commit SHA may change after rebase; use only this newly resolved SHA for cleanup. Never choose an archive merely because it is `HEAD` or because it was the original handoff SHA.

## Constrained cleanup and continuation handoff

Run only `npm run plans:cleanup -- --apply --goal <goal-path> --commit <resolved-archive-sha>`, then require `plans/` to contain only the regular tracked `plans/template.md` and run `npm run plans:guard`. On any failure, report it, remove nothing further, and do not push, stage, create a task commit, or create/update a pull request.

On success, require a clean index and emit one self-contained `$git-commit-push-pr` continuation handoff. It must pin repository root, remote, branch, post-cleanup HEAD, base ref and current base OID, resolved archive SHA, goal path and SHA-256, template-only inventory, `plans:guard` success, and clean-index status. State that this is a verified `$plan-finalize` continuation and authorize only the normal non-force push/PR completion path; it does not authorize plan cleanup, staging, a new task commit, force push, merge, or CI waiting.
