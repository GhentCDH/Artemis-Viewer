# Artemis Viewer context

## Responsibility

Artemis Viewer is a static SvelteKit application for exploring historical maps,
IIIF images, place names, and related datasets. It owns presentation, state,
interaction, accessibility, and client-side data loading.

Compiled map collections and artifacts belong to Artemis Data. Do not hardcode
collection catalogs or duplicate pipeline-owned schemas in viewer documentation.

## Runtime and layout

- The app uses SvelteKit 2, Svelte 5, TypeScript, MapLibre GL, Allmaps, and
  OpenSeadragon.
- Application code lives under `app/`; run package commands there.
- `app/src/lib/app/ArtemisApp.svelte` is the orchestration shell.
- `app/src/lib/core/` contains dataset loading, map setup, and renderers.
- `app/src/lib/features/` contains user-facing feature modules.
- `app/src/lib/shared/` contains reusable primitives, localization, and metadata
  utilities.
- `app/src/routes/+page.svelte` should remain a thin application mount.

Before editing components, styles, markup, or UI state, follow
`../conventions/svelte-frontend.md`.

## Data contract

- Production data defaults to
  `https://ghentcdh.github.io/Artemis-Data/build`.
- Viewer registries describe layers, sublayers, sources, artifacts, and image
  collections.
- Renderer-specific types under `core/renderers/` must remain compatible with
  the compact artifacts produced by Artemis Data.
- Treat external IIIF manifests and remote map services as untrusted input;
  validate structural fields at use.

When a required artifact or schema is missing, determine whether the fix belongs
in the viewer consumer or the Artemis Data producer before changing either repo.

## State and UI

- Cross-feature or cross-pane state belongs in a shared store.
- Parent-to-child feature state uses props and callbacks.
- Component-local transient state remains local.
- Left/right pane behavior must be parameterized by pane ID rather than copied.
- Localization lives under `app/src/lib/shared/i18n/`; update Dutch and English
  together when adding user-visible text.

## Development and validation

From `app/`:

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

Run both `pnpm check` and `pnpm build` for changes affecting components,
renderers, routing, assets, or deployment behavior.

## Deployment

- `Manual - Deploy viewer` builds `app/build` and publishes an exact snapshot to
  the `live` branch.
- `Auto - Create release` runs after a successful deployment.
- The deployment base path is derived from the repository name unless
  `app/static/CNAME` configures a custom domain.
- `keep_files: false` ensures retired static assets are removed.

Do not edit the generated `live` branch manually.

## Debugging routes

- Dataset or registry loading: `app/src/lib/core/dataset/`
- Map and layer lifecycle: `app/src/lib/core/map/` and `core/renderers/`
- Timeline selection: `app/src/lib/features/timeline/`
- Search behavior: `app/src/lib/features/search/`
- IIIF document viewer: `app/src/lib/features/viewer/`
- Developer switches: `app/src/lib/features/developerSettings/`
- Shared styling tokens: `app/src/app.css`
