# Browser API documentation and recovery

Use the current public Codex in-app Browser API and its tool-provided documentation. Before operating a tab, read the documentation returned by the required initialization call. If the provider requires a separate acknowledgment, make it in a later call after reading the full document.

A missing-documentation error is not evidence of a permission denial. Read/acknowledge as required and retry the affected operation in the same task. After a runtime reset, initialize and read the current documentation again; do not reuse stale handles or acknowledgments.

Use only observed URLs and tab identities that match the owned runtime. Follow actual permission denials; do not bypass them through another Browser, transport, or task. Stop repeated identical tool errors and report the observed limitation as UI unverified. Do not infer account configuration failure from a documentation error.

Feature smoke does not require a CDP canary, DPR override, parity adapter, checkpoint, or capability matrix. Follow [workflow-verification-contract.md](workflow-verification-contract.md) for the small visual/happy-path scope and `.claude/rules/dev-server.md` for ownership and cleanup.
