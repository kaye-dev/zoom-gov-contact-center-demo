# Production-parity UI prototypes

Use this workflow for every user-visible change. The approved prototype is the production UI acceptance contract. It may fake data, persistence, authorization, and backend side effects; it may not look like a wireframe, separate product, partial sketch, or speculative redesign unless the user requested one.

The production implementation must be able to replace simulated behavior with real components and APIs without redesigning the screen. If it cannot, the prototype is not ready for approval.

## Establish the baseline

1. Identify the closest existing route and the shared shell that owns the planned screen.
2. Before creating HTML, inspect that route in the Codex in-app Browser at desktop and 390×844. Confirm the runtime owner, URL, locale, and state so a stale process or different checkout is not treated as the baseline.
3. Inspect the shell, page component, global styles and tokens, reusable controls, icon system, and affected responsive rules.
4. Record the baseline route, source paths, viewport sizes, and preserved invariants in the goal's `UI契約`.

Before comparing surfaces, record the values each surface actually reports:

- `window.innerWidth` and `window.innerHeight`;
- `window.devicePixelRatio`;
- `window.scrollX` and `window.scrollY`;
- locale and rendered copy;
- document theme class;
- user identity, authorization, fixture data, query state, logical route, and UI state;
- runtime owner, checkout, and commit when they can differ.

The pair is not comparable while a relevant condition differs. A requested viewport is not proof that both pages accepted it. Compare page-content screenshots rather than browser chrome. Align scroll offsets or compare document coordinates. If the live route cannot be opened, use repository source and supplied screenshots, mark live parity unverified, and do not present the prototype as approval-ready.

## Preserve product identity

Unless the request includes a redesign, preserve brand and city names, header and navigation, page width and padding, typography and density, semantic colors and tokens, borders, radii, shadows, focus and disabled states, component vocabulary, icons, breakpoint behavior, and overflow model.

Do not invent a hero, breadcrumb, sidebar, hamburger menu, card shadow, background color, brand wording, icon style, or accent palette merely to make the prototype feel designed. New patterns must be required by the feature and look native beside the closest existing pattern.

### Reuse the production styling pipeline

This application uses Tailwind CSS v4 and semantic tokens from `app/globals.css`.

1. Copy the exact production utility strings and direct-child structure for unchanged shell, rows, forms, buttons, inputs, focus styles, disabled states, and responsive variants.
2. Create `prototype/tailwind.css` that imports the production stylesheet and registers every prototype HTML and JavaScript source. From `plans/<slug>/prototype/`, the import is:

   ```css
   @import "../../../app/globals.css";
   @source ".";
   ```

   Keep this file byte-for-byte identical to the two lines above, including its final newline. The builder rejects custom `@import`, `@source`, `@plugin`, `@config`, and all other additions so an ignored artifact cannot load code or read outside its prototype directory. The legacy `plans/tmp/<slug>/prototype/` contract differs only in using `../../../../app/globals.css`.

3. Compile the local stylesheet:

   ```sh
   node .agents/skills/plan/scripts/build-prototype-css.mjs \
     plans/<slug>/prototype
   ```

4. Load only the generated `styles.css`. Keep HTML, CSS, and JavaScript in separate local files because the artifact server rejects inline script and style through its CSP. Do not use a CDN, remote asset, or copied token palette.

Complete styling with production utilities and `app/globals.css`. Do not add handwritten declarations, `@apply` component classes, duplicated tokens, or parallel styling abstractions by default. If a concrete requirement cannot be expressed with the production pipeline, stop before writing CSS, show the missing behavior and proposed rule, obtain explicit approval, and record the narrow exception in `UI契約`.

Keep complete Tailwind class names in HTML or JavaScript rather than constructing fragments. Register prototype files explicitly because generated plan directories are ignored by Git and automatic source detection can omit them.

### Implement every production theme

Both light and dark are required. Reuse the production document classes, semantic tokens, initial synchronization, stored preference, transition suppression, `color-scheme`, and existing toggle placement.

- Verify native checkbox, radio, select, and text-input rendering in both themes, including accent, dimensions, checked, unchecked, disabled, and focus-visible states.
- Do not add a product-facing theme toggle where production has none. Use stable reviewer-only query entry points such as `?theme=light` and `?theme=dark` without overwriting the production preference.
- Exercise normal content and every applicable loading, empty, error, disabled, saving, success, overlay, focus, and hover state in both themes.
- Record the actual document class and computed semantic colors. Source classes without rendered evidence are insufficient.

### Treat responsiveness as a breakpoint contract

Inventory every affected responsive utility and compiled rule that changes layout, wrapping, visibility, alignment, or control placement.

- Always verify 390×844 and the representative desktop viewport.
- For every relevant layout-changing breakpoint, verify one CSS pixel below and exactly at the breakpoint, such as 639/640 and 767/768 where `sm:` and `md:` apply.
- Repeat boundary checks for every state whose layout changes there.
- Check actual viewport, DPR, scroll, document width, overflow, clipping, wrapping, modal fit, focus visibility, and downstream displacement.
- Record which breakpoint causes each transformation; `responsive: pass` without boundary evidence is insufficient.

### Inventory the state graph

Inspect source and operate the live route before authoring the prototype. List every state that changes layout or constrains the feature, including edit forms, dialogs, menus, disabled siblings, saving, validation, success, conflict, and failure.

For each state record rendered, removed, hidden, disabled, and inert elements; active element and keyboard traversal; entry, Escape, exit, and focus return; layout relationships; visible copy and realistic fixtures; and transitions. A new control extends existing mutual-exclusion and disabled-state rules rather than replacing existing interactions with generic stand-ins.

## Build a credible screen

- Reproduce the full affected screen in its real shell, not an isolated showcase.
- Implement every affected route, dialog, popover, menu, validation message, confirmation, and material state, linked into the intended flow.
- Finalize visible copy, hierarchy, component choice, control placement, disabled behavior, and responsive transformations before approval.
- Use realistic content lengths and density; use local files only.
- Keep reviewer controls outside the product surface or expose them through query parameters.
- Preserve semantic HTML, native disabled behavior, cursors, keyboard operation, focus visibility and return, announcements, and reduced motion.
- Preserve unchanged copy exactly. Accessibility polish is still a product change when production does not contain it and the request does not authorize it.

## Compare before approval

Serve the artifact with `./dev-prototype.sh <slug>` and compare it side by side with the baseline. At minimum verify shell, typography, primitives, both themes, desktop, 390×844, breakpoint boundaries, overflow, keyboard, focus, theme switching, native controls, applicable states, console, network, and every intentional deviation.

For unchanged regions compare bounding rectangles and the computed properties that determine appearance: display, parent, grid or flex tracks, gap, padding, margin, size, font, border, radius, color, shadow, outline, opacity, disabled state, and visibility. Exact token and state mismatches fail. At most 1 CSS pixel is allowed only for raster or subpixel rounding.

Capture aligned screenshot pairs for each material state and divide the screen into unchanged regions, intentional delta regions mapped to requirements, and downstream regions that may move only by the measured size of an insertion. Compare the accessibility snapshot or equivalent DOM-backed state as well.

Hard failures include mismatched comparison conditions, approximate handwritten styling, unapproved CSS, missing themes or breakpoint evidence, stale theme controls, clipping, existing controls with wrong visibility or enabled state, generic stand-ins, unexplained focus or layout differences, and evidence limited to the initial state.

Create a parity matrix in `UI契約` with one row per affected route, overlay, and material state. Record prototype entry point, actual conditions, light and dark results, screenshot evidence, unchanged-region result, intentional difference IDs, desktop, 390×844, relevant boundaries, keyboard/focus/theme result, and open decisions.

Set `machine parity: 合格 — YYYY-MM-DD — <evidence summary>` only when every row passes; otherwise use `machine parity: 未確認`. Machine parity never becomes user approval automatically. Keep `UI承認記録: 未承認` until the user explicitly approves the rendered prototype, then record `UI承認記録: YYYY-MM-DD — <explicit approval basis>`. After production implementation, repeat the same matrix against the live application and report the dated implementation-parity evidence to `$review`; any material departure requires an updated contract and renewed approval.
