<h1><img src="app/static/favicon.svg" alt="Artemis logo" width="40"> <a href="https://kaart.scheldegemapt.be/">Artemis Viewer</a></h1>

Web viewer for the Artemis project, built with SvelteKit. It combines historical
maps of the Scheldt region with place-name search, IIIF images, and comparison
tools in an interactive MapLibre map.

## What it does

- Browse georeferenced IIIF and tiled maps on an interactive timeline
- Search historical place names, map documents, and the Massart image collection
- Compare two synchronized map views side by side
- Inspect maps, images, and cadastral parcels in context
- Share a view through URL-based map and viewer state

The map collections and compiled datasets are maintained separately in
[Artemis-Data](https://github.com/GhentCDH/Artemis-Data).

## Development

Requirements: Node.js 22 and pnpm 11.

```bash
cd app
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm check       # TypeScript and Svelte checks
pnpm build       # Production build
pnpm preview     # Preview the production build
```

## Architecture

The application uses SvelteKit 2 and Svelte 5, with MapLibre GL for the map,
Allmaps for georeferenced IIIF layers, OpenSeadragon for deep-zoom images, and
the static adapter for deployment.

Most source code lives under `app/src/lib`:

- `app/` — application shell and map panes
- `core/` — datasets, map setup, and layer renderers
- `features/` — timeline, search, image browser, viewer, and other UI features
- `shared/` — reusable components, localization, and metadata utilities

## Data

At runtime, the viewer reads compiled data and configuration from the
[Artemis-Data build](https://ghentcdh.github.io/Artemis-Data/build). The default
base URL and external data sources are configured in the app; repository-local
static assets live in `app/static`.

## Deployment

The `Manual - Deploy viewer` workflow builds the static app and publishes `app/build`
to the `live` branch. The deployment base path is derived from the repository name, or
omitted when `app/static/CNAME` defines a custom domain.

The deployed app uses an SPA fallback and requires no application server.
