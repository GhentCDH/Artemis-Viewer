# Artemis Viewer file index

Use this index to locate the owner of a behavior before searching broadly.

| Path | Responsibility |
| --- | --- |
| `app/src/routes/+page.svelte` | Thin route mount for the viewer |
| `app/src/lib/app/ArtemisApp.svelte` | Application shell, pane orchestration, overlays, URL persistence, and screenshots |
| `app/src/lib/app/MapPane.svelte` | One MapLibre pane and its renderer lifecycle |
| `app/src/lib/core/dataset/` | Data base URLs, registry loading, and dataset types |
| `app/src/lib/core/map/` | MapLibre initialization, cameras, basemaps, and shared map behavior |
| `app/src/lib/core/renderers/types.ts` | Renderer contracts and Allmaps options |
| `app/src/lib/core/renderers/iiif/` | IIIF geomaps loading, Allmaps rendering, masks, and diagnostics |
| `app/src/lib/core/renderers/pmtiles/` | Raster and vector PMTiles rendering |
| `app/src/lib/core/renderers/services/` | Remote WMS/WMTS rendering |
| `app/src/lib/features/basemap/` | Basemap selection and map feature bubbles |
| `app/src/lib/features/branding/` | Project information, team, partners, and branding trigger |
| `app/src/lib/features/developerSettings/` | Developer controls and persisted rendering diagnostics |
| `app/src/lib/features/images/` | Image collection pins, browser, previews, and sprite access |
| `app/src/lib/features/screenshot/screenshot.ts` | Map, viewer, and watermark PNG composition |
| `app/src/lib/features/search/` | Search indexes, ranking, UI, and navigation |
| `app/src/lib/features/timeline/` | Timeline scale, meanders, layer selection, and sublayer controls |
| `app/src/lib/features/viewer/` | OpenSeadragon viewer and external IIIF manifest parsing |
| `app/src/lib/shared/i18n/` | Locale state and Dutch/English messages |
| `app/src/lib/shared/metadata/` | Reusable metadata display and source actions |
| `app/src/lib/shared/primitives/` | Base controls, windows, tooltips, toggles, and preview bubbles |
| `app/src/lib/shared/url/` | Shareable viewer URL state encoding and persistence |
| `app/src/app.css` | Root palette, semantic colors, spacing, typography, radii, and z-index tokens |
| `app/src/app.html` | Document shell, font preloads, and global font faces |
| `app/static/` | Repository-owned static assets copied into the build |
| `app/patches/` | Version-pinned dependency patches |
| `.github/workflows/deploy.yml` | Manual static build and clean `live` publication |
| `.github/workflows/release.yml` | Automatic release creation after deployment |
| `README.md` / `readme.md` | Concise project guide; tracked case variants must remain synchronized |

Generated or local-only paths:

| Path | Responsibility |
| --- | --- |
| `app/.svelte-kit/` | Generated SvelteKit state |
| `app/build/` | Generated static deployment output |
| `app/node_modules/` | Installed dependencies |
| `.pnpm-store/` | Optional repository-local pnpm cache |
