# Production-parity UI prototypes

Use this workflow only for a user-visible change. The approved prototype is the production UI acceptance contract. It is allowed to fake data and side effects; it is not allowed to look like a wireframe, a separate product, a partial sketch, or a speculative redesign unless the user asked for one.

The production implementation should be able to replace the prototype's in-memory data and simulated effects with real components, APIs, authorization, and persistence without redesigning the screen. If that is not yet possible, the prototype is not ready for approval.

## Establish the baseline

1. Identify the closest existing route and the shared shell that will own the planned screen.
2. Before creating HTML, inspect that route in the Codex in-app Browser at desktop and 390×844. Confirm the runtime owner, URL, locale, and state so a stale process or different checkout is not mistaken for the baseline.
3. Inspect the source that renders the baseline: shell, page component, global styles or tokens, reusable controls, icon system, and relevant responsive rules.
4. Record concrete evidence in the plan's `UI契約`: baseline route, source paths, viewport sizes, and the invariants that the prototype must preserve.

If the live route cannot be opened, derive the baseline from repository source and supplied screenshots, mark live parity unverified, and do not present the prototype as UI-ready.

## Preserve the product identity

Unless the requested change explicitly includes a redesign, preserve:

- product and city names, header height, navigation grouping, logout treatment, and active states;
- page max width, outer padding, content alignment, breakpoint behavior, and overflow model;
- font stack, heading scale, body scale, weights, line heights, and density;
- semantic colors, borders, radii, shadows, focus rings, disabled states, and button hierarchy;
- existing component and icon vocabulary, including SVG icons when the application already has them.

Do not invent a hero section, breadcrumb, sidebar, hamburger menu, card shadow, background color, brand wording, icon style, or accent palette merely to make the mock feel more designed. Add a new pattern only when the feature needs it, and make it look native beside the nearest existing pattern.

## Build a credible screen

- Reproduce the full affected screen or component in its real shell, not an isolated showcase.
- Implement every affected route, dialog, popover, menu, validation message, confirmation, and state that changes the user's understanding of the final experience. Link the prototype surfaces into the intended end-to-end flow.
- Finalize visible copy, information hierarchy, component selection, control placement, disabled behavior, and responsive transformations in the prototype. Do not defer those decisions to the production implementer.
- Use realistic content length, row count, labels, validation messages, and control density. Do not use lorem ipsum or conspicuously fake decoration.
- Use local files only. Do not load fonts, CSS, scripts, images, APIs, analytics, or other resources from external origins.
- Keep review controls out of the product surface. When state switching is useful, place it in a visually separate reviewer toolbar or use query parameters; it must not be confused with shippable UI.
- Preserve semantic HTML, native disabled behavior, pointer and disabled cursors, keyboard operation, focus visibility, focus return, announcements, and reduced-motion behavior.
- At 390×844, follow the existing application's responsive model. Do not replace it with a newly invented mobile navigation pattern.

## Compare before approval

Serve the artifact with `node scripts/serve-plan-artifact.mjs plans/tmp/<plan-id>/prototype` and inspect it in the Codex in-app Browser.

Compare the baseline and prototype side by side. At minimum, verify and record:

- shell: brand, header, navigation, main width, outer padding, and page background;
- typography: font family and the computed size, weight, and line height of the main heading and controls;
- primitives: primary and secondary buttons, inputs, tables or cards, borders, radii, colors, and focus styles;
- behavior: desktop, 390×844, horizontal overflow, keyboard, focus, normal and applicable exceptional states, console errors, and failed local requests;
- deviations: every intentional visual difference and the requirement that justifies it.

Fix unexplained differences before asking the user to approve the UI. Functional completeness, accessibility, and responsive behavior do not compensate for visual divergence from the product baseline.

Create a parity matrix in `UI契約` with one row per affected route or overlay and applicable state. For each row, record the prototype entry point, desktop result, 390×844 result, keyboard/focus result, and whether any decision remains open. UI approval requires every row to pass and every material design decision to be resolved.

After production implementation, repeat the same matrix against the live application. Any implementation departure from the approved prototype requires an explicit UI-contract update and user approval; it cannot be treated as an incidental implementation detail.
