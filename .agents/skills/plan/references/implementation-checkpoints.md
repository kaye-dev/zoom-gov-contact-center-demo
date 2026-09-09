# Optional scoped local commits

Use local stage commits only when the adopted goal explicitly requests them. Otherwise keep implementation changes uncommitted until the user's shipping request.

For a requested unit, resolve its purpose, dependencies, source scope, checks, and observable completion from the goal. Run affected checks, inspect the exact staged patch, and commit only that unit after it passes. Preserve unrelated staged/working-tree changes and generated plan artifacts. Keep hooks enabled and use repository commit conventions.

Report the commit and actual checks, then continue to the next unit under the same authorization. A local commit does not authorize push, PR creation, merge, or deployment. Final verification reuses valid earlier checks and runs only missing or invalidated checks plus the representative final UI smoke where applicable.

No stage receipt, approval ledger, detailed parity aggregation, or new state machine is required. Historical checkpoint scripts/records are stored for compatibility and are not part of this workflow.
