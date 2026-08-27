# Production-parity UI prototypes

Use this workflow only for a user-visible change. The approved prototype is the production UI acceptance contract. It is allowed to fake data and side effects; it is not allowed to look like a wireframe, a separate product, a partial sketch, or a speculative redesign unless the user asked for one.

The production implementation should be able to replace the prototype's in-memory data and simulated effects with real components, APIs, authorization, and persistence without redesigning the screen. If that is not yet possible, the prototype is not ready for approval.

## Establish the baseline

1. Identify the closest existing route and the shared shell that will own the planned screen.
2. Before creating HTML, inspect that route in the Codex in-app Browser at desktop and 390×844. Confirm the runtime owner, URL, locale, and state so a stale process or different checkout is not mistaken for the baseline.
3. Inspect the source that renders the baseline: shell, page component, global styles or tokens, reusable controls, icon system, and relevant responsive rules.
4. Record concrete evidence in the plan's `UI契約`: baseline route, source paths, viewport sizes, and the invariants that the prototype must preserve.

Before comparing two surfaces, record the conditions reported by each surface, not only the values requested from the browser tool:

- `window.innerWidth` and `window.innerHeight`;
- `window.devicePixelRatio`;
- `window.scrollX` and `window.scrollY` for state screenshots and viewport-relative geometry;
- locale and rendered copy;
- light or dark theme;
- user identity, authorization, fixture data, and relevant query state;
- runtime owner, checkout, and commit when they can differ.

The pair is not comparable while any relevant condition differs. Setting a viewport override is not evidence that both tabs accepted it; read the resulting viewport from each page. Compare page-content screenshots rather than browser chrome screenshots. Either align scroll offsets or compare document coordinates by adding `scrollX` and `scrollY` to viewport-relative rectangles. Focus-driven automatic scrolling is not a layout difference.

If the live route cannot be opened, derive the baseline from repository source and supplied screenshots, mark live parity unverified, and do not present the prototype as UI-ready.

## Preserve the product identity

Unless the requested change explicitly includes a redesign, preserve:

- product and city names, header height, navigation grouping, logout treatment, and active states;
- page max width, outer padding, content alignment, breakpoint behavior, and overflow model;
- font stack, heading scale, body scale, weights, line heights, and density;
- semantic colors, borders, radii, shadows, focus rings, disabled states, and button hierarchy;
- existing component and icon vocabulary, including SVG icons when the application already has them.

Do not invent a hero section, breadcrumb, sidebar, hamburger menu, card shadow, background color, brand wording, icon style, or accent palette merely to make the mock feel more designed. Add a new pattern only when the feature needs it, and make it look native beside the nearest existing pattern.

### Reuse the production styling pipeline

The production application uses Tailwind CSS v4 and semantic tokens from `app/globals.css`. Use the same pipeline for a prototype:

1. Copy the exact production utility strings and direct-child structure for unchanged shell, rows, forms, buttons, inputs, focus styles, disabled states, and responsive variants. JSX-to-HTML syntax may change; layout semantics may not.
2. Create `prototype/tailwind.css` that imports the production stylesheet and explicitly registers the ignored prototype sources:

   ```css
   @import "../../../../app/globals.css";
   @source "./index.html";
   @source "./theme.js";
   @source "./app.js";
   ```

3. Compile a local stylesheet:

   ```sh
   node .agents/skills/implementation-planner/scripts/build-prototype-css.mjs \
     plans/tmp/<plan-id>/prototype
   ```

4. Load only the generated `styles.css`. Do not use the Tailwind Play CDN, remote assets, or a second set of copied token values.

Complete prototype styling with production Tailwind utilities and `app/globals.css`. Do not add handwritten declarations, `@apply` component classes, duplicated tokens, or parallel `.detail-row`, `.primary-button`, `.baseline-input`, or similar styling abstractions by default. If a concrete requirement cannot be expressed with the production Tailwind setup, stop before writing CSS, show the user the exact missing behavior and proposed rule, and obtain explicit approval. Record that approval and the narrow exception in `UI契約`.

Tailwind source detection treats class names as text. Keep complete utility class names in HTML or JavaScript rather than constructing fragments such as `bg-${color}`. Register prototype files explicitly because `plans/tmp/` is ignored by Git and automatic detection can skip ignored files.

### Implement every production theme

Theme support is part of the completed UI, not an optional screenshot variant. Inspect the production root layout, theme store or bootstrap, toggle component, semantic tokens, and persistence behavior before implementing the prototype. This repository supports `light` and `dark`; both are required for every UI prototype.

- Apply the same `light` and `dark` document classes and compile the same semantic tokens from `app/globals.css`. Do not duplicate color values or simulate dark mode with filters, opacity, or an alternate handwritten palette.
- Copy the production root's `color-scheme` utilities or equivalent semantic document styling as part of the theme contract. A `dark` class alone does not make native inputs dark: verify that checkboxes, radios, selects, text inputs, and other user-agent controls report the intended computed `colorScheme` in both themes.
- Style checkbox and radio accents with the production semantic accent token rather than a fixed palette shade. In flex or grid rows, preserve the intended control dimensions so labels cannot shrink the indicator. Verify checked, unchecked, disabled, and focus-visible states in both themes; record computed `accentColor`, dimensions, and an actual screenshot instead of inferring support from utility names.
- Match the production default, pre-paint synchronization, stored preference, transition suppression, and runtime switching behavior. A theme change must update the whole surface without reload-only assumptions, stale controls, a flash of the wrong theme, or a layout shift.
- Preserve the production location and appearance of an existing theme toggle. Do not add a product-facing toggle to a route that does not have one. For reviewer access in that case, support stable local query entry points such as `?theme=light` and `?theme=dark`; query state must not add visible prototype controls or overwrite the user's stored production preference.
- Exercise normal content and every visually distinct loading, empty, error, disabled, saving, success, overlay, focus, and hover state in both themes. Verify semantic foreground/background, borders, icons, focus rings, backdrops, disabled opacity, and status colors rather than assuming `dark:` utilities are sufficient.
- Record the actual document theme class and computed semantic colors in the parity evidence. A class name in source without rendered verification does not prove theme support.

### Treat responsiveness as a breakpoint contract

Inspect the affected production utilities and compiled CSS to inventory every breakpoint that changes layout, wrapping, visibility, alignment, or control placement. Do not infer completion from a desktop screenshot plus a single mobile screenshot.

- Always verify 390×844 and the representative desktop viewport.
- For every relevant layout-changing breakpoint, verify one CSS pixel below and exactly at the breakpoint. For example, a surface using `sm:` and `md:` variants requires checks at 639/640 and 767/768 unless repository configuration defines different values.
- Run the primary mobile and desktop comparisons in both themes. Repeat breakpoint-boundary comparisons for each state whose grid, flex, visibility, dialog sizing, navigation wrapping, or action placement changes at that breakpoint.
- Check actual `innerWidth`, `innerHeight`, DPR, scroll offsets, document width, horizontal overflow, clipped content, text wrapping, modal fit, focus visibility, and downstream displacement caused by intentional insertions.
- Record the responsive inventory and results in the parity matrix. State which breakpoint causes each transformation; `responsive: pass` without boundary evidence is insufficient.

### Inventory the baseline state graph

Inspect source and exercise the live route before authoring the prototype. List every state on the affected surface that either changes layout or constrains the new feature, including existing edit forms, dialogs, disabled siblings, saving, validation, success, and failure states.

For every state pair, record:

- which elements are rendered, removed, hidden, disabled, or inert;
- the active element on entry, keyboard traversal, Escape behavior, and focus destination on exit;
- direct-child and grid or flex relationships that determine placement and row height;
- visible copy and realistic fixture values;
- transitions into and out of the state.

Adding a new control to an existing screen extends the existing mutual-exclusion and disabled-state rules. It does not authorize a simplified replacement for existing interactions. If an unchanged control is present in the prototype, its relevant reachable states must match production or be explicitly marked incomplete; do not implement a generic stand-in interaction.

## Build a credible screen

- Reproduce the full affected screen or component in its real shell, not an isolated showcase.
- Implement every affected route, dialog, popover, menu, validation message, confirmation, and state that changes the user's understanding of the final experience. Link the prototype surfaces into the intended end-to-end flow.
- Finalize visible copy, information hierarchy, component selection, control placement, disabled behavior, and responsive transformations in the prototype. Do not defer those decisions to the production implementer.
- Use realistic content length, row count, labels, validation messages, and control density. Do not use lorem ipsum or conspicuously fake decoration.
- Use local files only. Do not load fonts, CSS, scripts, images, APIs, analytics, or other resources from external origins.
- Keep review controls out of the product surface. When state switching is useful, place it in a visually separate reviewer toolbar or use query parameters; it must not be confused with shippable UI.
- Preserve semantic HTML, native disabled behavior, pointer and disabled cursors, keyboard operation, focus visibility, focus return, announcements, and reduced-motion behavior.
- At every affected width, follow the existing application's responsive model. Do not replace it with a newly invented mobile navigation pattern.
- Preserve unchanged copy exactly. A clearer label, extra helper, skip link, region wrapper, focus ring, or accessibility behavior is still a product change unless the requested scope includes it and the production implementation will make the same change.

## Compare before approval

Serve the artifact with `./dev-prototype.sh <plan-id>` and inspect its output URL in the Codex in-app Browser. When the prototype is the most recently modified one, `./dev-prototype.sh` is sufficient.

Compare the baseline and prototype side by side. At minimum, verify and record:

- shell: brand, header, navigation, main width, outer padding, and page background;
- typography: font family and the computed size, weight, and line height of the main heading and controls;
- primitives: primary and secondary buttons, inputs, tables or cards, borders, radii, colors, and focus styles;
- behavior: light and dark at desktop and 390×844, relevant breakpoint boundaries, horizontal overflow, keyboard, focus, theme switching, native-control checked/unchecked/disabled states, normal and applicable exceptional states, console errors, and failed local requests;
- deviations: every intentional visual difference and the requirement that justifies it.

Use paired evidence for the same route, viewport, locale, fixture, and state. For unchanged regions, compare bounding rectangles and the computed properties that control layout and appearance: display, direct parent, grid or flex tracks, span, gap, padding, margin, size, font, border, radius, color, shadow, outline, opacity, disabled state, and visibility. Exact token and state mismatches fail. Allow at most 1 CSS pixel only for raster or subpixel rounding; do not use that tolerance to excuse a different utility, border, grid track, or control structure.

Capture an aligned screenshot pair for each material state. Whole-page similarity is insufficient when a new row or dialog intentionally changes the page. Divide the screen into:

- unchanged regions, which must match;
- intentional delta regions, each mapped to a requirement;
- downstream regions, which may move only by the measured size of an intentional insertion.

Also compare the accessibility snapshot or equivalent DOM-backed state so a visually faint but still rendered control, a missing disabled flag, or an extra focus stop is not missed.

The following are hard failures and must be fixed before approval:

- the two pages report different comparison conditions;
- unchanged production Tailwind utilities or DOM relationships were re-created with approximate handwritten CSS;
- handwritten CSS was added without the user's explicit approval recorded in `UI契約`;
- only one production-supported theme is implemented or a theme is represented only by unverified source classes;
- a theme switch flashes the wrong theme, changes layout, leaves stale controls, or bypasses the production theme mechanism;
- responsive evidence omits a relevant breakpoint boundary or hides clipping and overflow between the chosen endpoint widths;
- an existing control remains enabled, visible, or focusable when production disables, removes, or hides it;
- an existing interaction was replaced by a generic stand-in;
- focus border, outline, button border, grid span, row height, copy, or fixture differs without an explicit requirement;
- the evidence covers only the initial state while an affected interaction expands a form, menu, dialog, or error state.

Fix unexplained differences before asking the user to approve the UI. Functional completeness, accessibility, and responsive behavior do not compensate for visual divergence from the product baseline.

Create a parity matrix in `UI契約` with one row per affected route or overlay and applicable state. For each row, record the prototype entry point, light and dark results, actual conditions from both surfaces, screenshot evidence, unchanged-region result, intentional difference IDs, desktop result, 390×844 result, relevant breakpoint-boundary results, keyboard/focus/theme-switch result, and whether any decision remains open.

Call the result `machine parity passed` only when every row passes. Do not convert that result into user approval. UI approval requires every row to pass, every material design decision to be resolved, and an explicit approval from the user after they inspect the rendered prototype.

After production implementation, repeat the same matrix against the live application. Any implementation departure from the approved prototype requires an explicit UI-contract update and user approval; it cannot be treated as an incidental implementation detail.
