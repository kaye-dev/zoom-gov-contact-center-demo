# Base synchronization contract

Read this reference immediately before synchronizing a topic branch with its remote base. Use it only for explicitly requested base synchronization. Ordinary shipping can push a topic whose base has advanced.

Fetch the selected remote immediately before synchronization and inspect both `<remote>/<base>` and the remote topic ref. Base-only commits are a normal synchronization condition, not a reason to request another invocation; a remote topic ref with commits not contained in local `HEAD` is remote divergence and stops the operation.

Before integration, capture pre-sync `HEAD`, branch, remote base OID, remote topic OID, index digest, tracked diff, and a NUL-safe preservation snapshot for untracked paths outside the task allowlist, explicitly preserved paths, local plan/review artifacts, and ignored paths that could collide with incoming paths. Record only repository-relative path, file type, and content digest; never expose contents or enumerate an ignored dependency tree.

Compute incoming base name-status and merge base before touching the worktree. A preserved local path collides if it is the same path as an incoming tracked path, either path is an ancestor of the other, or the update replaces a file, directory, or symlink type. Stop before integration and report only conflicting paths. When supported, use `git merge-tree --write-tree <remote>/<base> HEAD` as an additional tracked-tree conflict check, never as a substitute for the local collision check.

- If `<remote>/<base>` is already an ancestor of `HEAD`, retain the snapshot and continue without integration.
- For an unpublished topic branch that needs integration, require an empty index and no tracked working-tree changes, then run `git rebase --no-autostash <remote>/<base>`.
- For a published topic branch that needs integration, require the same clean gates and run `git merge --no-autostash --no-edit <remote>/<base>`; never rewrite published history.
- Tracked dirty changes, a collision, remote divergence, or an in-progress Git operation stops the workflow. Non-conflicting untracked or ignored artifacts may remain in place. A non-conflicting untracked or ignored artifact alone is not this blocker.

After success, require the preservation snapshot to match exactly. On rebase or merge conflict, capture unresolved paths, abort, and verify the pre-sync `HEAD`, branch, index, tracked diff, and preservation snapshot are restored before stopping. In other words, the pre-sync HEAD, branch, index, tracked diff, and preservation snapshot are restored before stopping. Do not resolve, retry, stash, move, delete, restore, or repair automatically. A preservation mismatch is terminal.
