# Faithful UI prototypes

The prototype communicates the intended screen well enough to implement with real components and APIs. Inspect the closest source, shared shell, components, `DESIGN.md`, semantic tokens, typography, layout, and relevant responsive behavior before authoring. Mock only data, persistence, authorization, and backend side effects.

## Authoring

Use production Tailwind utilities and `app/styles/ui-foundation.css`, with the prototype itself as the Tailwind source. Run:

```sh
node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype
```

Include the affected screen and meaningful states in HTML. Use existing icons/components and accessible controls. Avoid placeholder content that hides layout problems. Keep assets local; do not add external APIs, analytics, or expose the repository root. Identify the adopted version by the prototype path and current contents.

## Final smoke and feedback

Finish authoring and CSS first, then serve with `./dev-prototype.sh <slug>` or the matching retained session. Follow [workflow-verification-contract.md](workflow-verification-contract.md) and `.claude/rules/dev-server.md` for one final Codex in-app Browser smoke: normally 1–3 representative scenarios for major UI breakage and the main happy path. Prototype persistence is a mock, not real application persistence. No strict pixel/DOM equality or all-state sweep is required.

Return a reviewable prototype through `./dev-prototype.sh --retain <slug>` with URL, owner, PID, result/unverified items, and stop command. Browser unavailability is reported as unverified. A live URL is availability, not a passed UI check.

For a design revision, update the same goal and necessary prototype, then perform one replacement smoke after static work. For a direct minor UI adjustment, implement the latest instruction and keep the goal/prototype; the difference is intentional. Keep optional human checks short and unchecked.

Detailed parity manifests, `prototype-revision.mjs`, estimates, and old evidence readers are not used by this authoring workflow.
