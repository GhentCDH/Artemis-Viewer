# Svelte frontend conventions

Apply these rules when writing, modifying, reviewing, or refactoring any Svelte
component, markup, style, design token, or UI state in this repository.

## Components

- Use an existing base component for recurring UI with the same DOM structure,
  ARIA role, and interaction model.
- Add a named variant when the same visual treatment recurs. A variant overrides
  existing exposed properties; it does not introduce a parallel styling API.
- Create a new base component only when structure or interaction semantics are
  genuinely different. Document the structural reason with the change.
- Compose feature UI from shared primitives such as `Button`, `Window`, and
  `Tooltip`; do not reproduce their chrome with feature-local markup.

## Exposed component variables

Every base component must declare its tunable CSS properties at the top of its
style block using exactly:

```css
/* -- exposed -- */
/* component variables */
/* -- end exposed -- */
```

Expose meaningful size, spacing, color, and radius controls as
`--component-property` variables. Accept and merge `class` and `style` on the
root element. Call sites may use passthrough only to set exposed variables, not
to alter a component's internal layout.

## State ownership

- Put state in a store when another feature, subtree, or pane must observe it.
- Use props downward and callbacks upward within one feature subtree.
- Keep transient state local when remounting the component should reset it.
- Parameterize shared pane behavior with `left` or `right`; never duplicate the
  implementation for each pane.

## Sizing and tokens

- Use `rem` for component dimensions and spacing.
- Raw `px` is allowed only for borders, hairlines, focus outlines, and shadow
  offsets.
- Use percentages or viewport units only for genuinely relative layout.
- Do not use CSS `zoom`.
- Define primitive palette, semantic colors, spacing, type, radius, and z-index
  tokens in `app/src/app.css`.
- Components may reference semantic and scale tokens, never raw palette tokens.
- Do not add literal hex or `rgba()` colors inside component styles. Derive
  translucency with semantic tokens and `color-mix()`.
- Derive component z-index values from named `--z-*` tokens.

Token naming:

- Palette: `--palette-{hue}-{step}`
- Semantic or scale: `--{category}-{role}`
- Component surface: `--{component}-{property}`

## Composition and accessibility

- Keep orchestration components divided into named semantic layout sections.
- Use shared buttons rather than bare `<button>` elements when the interaction
  matches the existing primitive.
- Base components own their internal roles and state attributes. Call sites add
  instance-specific labels and descriptions.
- Update both Dutch and English localization for user-visible text.

## Required review checklist

Before completing frontend work, inspect the diff for:

- Literal hex or `rgba()` values in component styles
- Raw `px` outside borders, outlines, hairlines, or shadows
- `--palette-*` references outside `app.css`
- Component z-index values not derived from `--z-*`
- Variants that introduce separate property names
- Base components without the exposed-variable block
- Hardcoded dimensions that should be exposed
- Call-site styles that alter primitive internals
- Stores used for state only a parent needs
- Shared state incorrectly held locally
- Duplicated left/right pane logic
- Bare controls or panel chrome that duplicate shared primitives
- New base components without a structural justification

Run `pnpm check` and `pnpm build` from `app/` after frontend changes.
