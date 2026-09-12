# Faithful, transferable UI prototypes

New UI prototypes use the shared Next.js/TypeScript/Tailwind host. Inspect the closest source, existing shell/components, `DESIGN.md`, semantic tokens and responsive behavior first. Import existing presentation components instead of rebuilding surrounding UI. Mock only data, persistence, authorization and backend side effects.

## Authoring

Write a default-exported Client Component in `plans/<slug>/prototype/entry.tsx`. Keep transferable UI in `components/*.tsx`, using ordinary typed props and callbacks; connect fixture data/actions in `entry.tsx` and `fixtures.ts`. Import existing components through `@/app/...`. For the administration shell, use `AdminShellView` with the same `visibleItems`, account name and tenant as the corresponding app state, plus a local `onSignOut` callback. Keep navigation, icons, controls and layout for unaffected regions intact.

An optional `prototype.config.json` selects `route` (default `/`), `tenant` (`lg`), `locale` (`ja`), `theme` (`light`), and required relative `public/` asset paths in `assets`. For example:

```json
{"route":"/admin/zaad","tenant":"lg","locale":"ja","theme":"light"}
```

The host supplies the root layout, existing LanguageProvider/ThemeSync, OS font and foundation. It runs without product configuration, login, DB or external API access. Use a registered local route for the affected screen; unrelated product destinations are outside the prototype. Select themes through the config or the existing `?theme=light|dark` behavior without adding a toolbar to product content.

```sh
node scripts/prototype-runtime.mjs check <slug>
./dev-prototype.sh --retain <slug>
```

The check validates the selected host/TSX and lints authoring sources; Next.js generates CSS when the prototype runs. Do not add a per-plan install, Next.js configuration, full product build, separate CSS build, or another preview framework. The runtime owns its generated `.local/prototype-runtime/<slug>/` files and isolated cache. Edit TSX through HMR and reuse an existing matching server when retaining it. Changes to `prototype.config.json` take effect after stopping and starting that owned prototype; ordinary TSX edits do not need a restart.

Use the production Tailwind utilities and `app/styles/ui-foundation.css`. CSS source detection includes only this prototype, its adopted shared source and the host, not other plans. Keep complete class names visible to Tailwind. Assets remain local; do not add analytics, external APIs or expose the repository root. Keep placeholder data representative of real content length, counts and permissions.

## Adopted source and transfer

On first preparation, the runtime saves existing UI/client source, selected public assets and dependency versions under `prototype/.shared/`. Its `@/*` imports resolve to that saved source. This preserves the comparison surface when implementation changes the original shared components; it is generated source preservation, not a second hand-maintained UI. Preserve it along with the plan and keep it out of staging. Production never imports anything from `plans/` or the prototype host.

For new components, record the prototype-to-production paths, typed props/action adapters and representative data in the goal's existing interface section. Implementation carries those TSX files into production and connects real adapters, preserving JSX/classes/local interaction code unless the accepted requirements need a change. Read the actual TSX, relevant saved shared components/styles and assets as visual requirements even when the goal omits details.

Do not refresh saved source during implementation or to conceal a visual difference. If an explicit design revision requires newer shared code, stop the owned prototype, run `node scripts/prototype-runtime.mjs refresh-shared <slug>`, and recheck the affected final scenario. Dependency drift is reported; do not automatically reinstall or downgrade dependencies. If an import needs product authentication or server data, isolate the needed presentation layer within the approved implementation scope rather than importing the whole product page. Plan authoring itself does not authorize production edits.

## Final smoke and feedback

Finish authoring and static checks, complete `./dev-prototype.sh --retain <slug>`, then run `./dev-confirmation.sh status <slug>` once in a separate call after that command exits. Use the same returned URL and required query for one final Codex in-app Browser smoke under [workflow-verification-contract.md](workflow-verification-contract.md) and `.claude/rules/dev-server.md`. Normally 1–3 representative scenarios cover major visual breakage and the main happy path. Compare corresponding data, permissions, viewport/theme/state during implementation within those same scenarios. Fixture saving is not real application persistence. No strict pixel/DOM equality or all-state sweep is required.

Return the live prototype with `./dev-prototype.sh --retain <slug>` and report URL, owner, PID, result/unverified items, and `./dev-confirmation.sh stop <slug>`. A failed retained route is a runtime failure, not Browser unavailability. Only when HTTP succeeds but Browser is unavailable is the UI unverified; a live URL only proves availability. Do not rebuild or restart solely to retain a matching process.

For a design revision, update the same goal/prototype and do one affected final smoke. For direct minor UI feedback, implement the latest instruction while preserving the goal/prototype; that difference is intentional. Keep human checks short and unchecked. Review and shipping reuse valid results. No extra approval, comparison phase, performance report, parity manifest or evidence reader is added.

## Existing HTML prototypes

Continue existing `index.html`/CSS/assets without conversion. Build their CSS with `node .agents/skills/plan/scripts/build-prototype-css.mjs plans/<slug>/prototype` and use the same `dev-prototype.sh` commands. `entry.tsx` and `index.html` must not coexist as competing entries. Legacy goals, evidence and archives retain their original contents and results. HTML reviews keep their static renderer.
