# Svelte conventions for Artemis Viewer

This guide explains how we build and maintain the viewer interface. Follow it
whenever you change a Svelte component, markup, styling, design tokens, or UI
state. The goal is a UI that remains consistent as features and compare-mode
behavior grow.

## Start with an existing component

Before creating a control or panel, look in `app/src/lib/shared/`. Reuse
primitives such as `Button`, `Window`, and `Tooltip` when the structure and
interaction are the same.

If the existing component is close but not quite right:

1. For a one-off size or color adjustment, override one of its exposed CSS
   variables.
2. If the same appearance is needed in several places, add a named variant.
3. Create a new base component only when the HTML structure, ARIA role, or
   interaction genuinely differs.

Variants change the values of existing component variables; they do not create
a second styling API. Record the reason in `DECISIONS.md` whenever a new base
component is introduced.

## Make base components configurable

Every base component declares its public CSS variables at the top of its style
block. Keep the markers exactly as shown so the API is easy to find:

```css
/* -- exposed -- */
--button-height: var(--control-height);
--button-bg: var(--color-surface);
/* -- end exposed -- */
```

Expose properties that callers may reasonably need to tune, including size,
spacing, color, and radius. Name them `--component-property`, such as
`--button-height` or `--window-radius`.

Base components also accept `class` and `style` and pass them to their root
element. A caller may use these props to set exposed variables only. It should
not reach into the component to change its internal layout.

## Put state in the right place

Use the smallest state scope that works:

- Keep temporary state local when closing and reopening the component should
  reset it. Search text, loading flags, and an open menu are typical examples.
- Use props downward and callbacks upward when only a parent and its children
  share the state.
- Use a store when another feature, component subtree, or compare pane needs to
  observe or change the state.

Shared reactive store filenames always end in `Store.svelte.ts`, for example
`timelineSelectionStore.svelte.ts`. This makes stores obvious in imports and
file searches. Reserve `*State.ts` for state types, URL serialization, and
other non-store helpers.

Compare-mode behavior must be parameterized with a pane ID such as `left` or
`right`. Do not maintain separate copies of the same pane logic.

## Use the shared design system

The viewer's root tokens live in `app/src/app.css`. Components use semantic and
scale tokens rather than inventing local values.

- Use `rem` for component dimensions and spacing.
- Use raw `px` only for borders, hairlines, focus outlines, and shadow offsets.
- Use percentages or viewport units only when the size genuinely depends on a
  parent or the viewport.
- Do not use CSS `zoom`.
- Do not put literal hex colors or `rgba()` values in component styles.
- Do not reference primitive `--palette-*` tokens from components. Use semantic
  color tokens instead.
- Derive translucent colors with `color-mix()` and semantic tokens.
- Derive every component z-index from a named `--z-*` token.

Use these naming patterns:

| Purpose | Pattern | Example |
| --- | --- | --- |
| Palette value | `--palette-{hue}-{step}` | `--palette-brown-900` |
| Semantic or scale token | `--{category}-{role}` | `--color-text`, `--space-3` |
| Component variable | `--{component}-{property}` | `--button-height` |

## Keep components understandable and accessible

Large orchestration components, such as `ArtemisApp.svelte`, should be divided
into clearly named layout sections. Feature components should compose shared
primitives instead of recreating buttons or panel chrome.

The base component owns its internal role and state attributes. The call site
adds context-specific labels and descriptions. When adding visible text, update
both the English and Dutch dictionaries under `app/src/lib/shared/i18n/`.

## Before opening a pull request

Review the frontend diff and confirm that:

- [ ] Components contain no literal hex or `rgba()` colors.
- [ ] Raw `px` values are limited to borders, outlines, hairlines, and shadows.
- [ ] Components do not reference `--palette-*` directly.
- [ ] Component z-index values use a named `--z-*` token.
- [ ] Variants only override existing component variables.
- [ ] Every base component has an exposed-variable block.
- [ ] Meaningful component dimensions are exposed rather than hardcoded.
- [ ] Call-site styles only set exposed variables.
- [ ] A store is not being used for state that only a parent needs.
- [ ] Every shared reactive store filename ends in `Store.svelte.ts`.
- [ ] Shared state has not accidentally been kept local.
- [ ] Left and right pane behavior shares one parameterized implementation.
- [ ] Controls and panels reuse the shared primitives where appropriate.
- [ ] Any new base component has a structural justification in `DECISIONS.md`.
- [ ] User-visible text exists in both English and Dutch.

Finally, validate the application from `app/`:

```bash
pnpm check
pnpm build
```
