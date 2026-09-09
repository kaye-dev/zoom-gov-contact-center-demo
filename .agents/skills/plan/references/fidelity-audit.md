# Implementation conformance

Read [workflow-verification-contract.md](workflow-verification-contract.md) for the verification scope.

Check the implementation against the goal, prototype intent, and latest user corrections. Review affected source/tests for the required behavior. UI smoke checks major layout breakage and main happy paths in normally 1–3 representative scenarios. Report actual observations, failures, and unverified items separately. Do not infer real persistence from a prototype or fixture display.

A valid smoke result is reused in review and shipping; an unchecked human item is not a failed implementation check. A known in-scope defect needs a fix and affected recheck. Missing Browser access leaves UI unverified without creating a feature-completion dependency on infrastructure work.

A direct minor UI instruction updates the expected UI without a plan/prototype rewrite. Design changes use explicit plan and implementation requests. Preserve permissions, data contracts, unrelated changes, and runtime ownership.

Historical detailed-parity records retain their original status and bytes. They do not define current completion gates, and a smoke pass never upgrades an old record to pass.
