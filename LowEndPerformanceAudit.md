# Low-End Device Performance Audit

Audit of `app/src` (application code only — no findings inside `node_modules`) for things that
make the viewer slower than it needs to be on weak GPUs, slow CPUs, and slow networks.
Date: 2026-07-16, branch `ref/viewerV2`.

Verified against the installed `maplibre-gl` 5.x dist where a finding depends on library
behaviour (noted inline). Findings are ordered by expected impact.

---

## A. Runtime / GPU — high impact

### A1. `preserveDrawingBuffer: true` costs GPU on every frame, and is probably unnecessary
`src/lib/core/map/maplibreInit.ts:53`

`preserveDrawingBuffer: true` forces the browser to keep the WebGL backbuffer after
compositing. On mobile/tiled GPUs this turns the cheap buffer *swap* into a buffer *copy*
every frame and disables several driver optimizations — a permanent tax on exactly the
devices this audit targets, paid whether or not a screenshot is ever taken.

The screenshot code (`src/lib/features/screenshot/screenshot.ts`) already reads each map
canvas **inside a `render` event after `triggerRepaint()`** (`waitForRenderFrame`). That
pattern is the documented way to read a MapLibre canvas *without*
`preserveDrawingBuffer` — the buffer is only cleared after the frame ends, and the read
happens during it. So contract part 1 of the 3-part screenshot contract is very likely
redundant with part 2.

**Suggestion:** remove `preserveDrawingBuffer: true`, then verify the screenshot export on
Chrome + Safari (the only consumer). Expected win: measurably lower per-frame GPU cost on
integrated/mobile GPUs, for free.

### A2. Uncapped canvas size + uncapped devicePixelRatio
`src/lib/core/map/maplibreInit.ts:56` (`maxCanvasSize: [Infinity, Infinity]`)

Fragment cost of the Allmaps warp shader scales linearly with canvas pixels (its own
comments note it scans a map's whole cached-tile texture array *per pixel*). Two
multipliers are currently unbounded:

- `maxCanvasSize: [Infinity, Infinity]` lifts MapLibre's default 4096px protective cap.
  A fullscreen window on a 4K display at DPR 2–3 produces a 16–60 MP drawing buffer.
  Low-end devices are frequently *high-DPR* (budget phones ship DPR 2.5–3 screens with
  weak GPUs), so this hits them hardest.
- There is no `pixelRatio` option, so MapLibre renders at full `devicePixelRatio`.
  DPR 3 means 9× the fragments of DPR 1 for the same view.

**Suggestion:**
- Replace `Infinity` with a finite cap (e.g. `[8192, 8192]`) that still fixes the original
  downscale bug on the displays you care about.
- Pass `pixelRatio: Math.min(window.devicePixelRatio, 2)` (or even an adaptive value using
  `navigator.hardwareConcurrency` / `deviceMemory` as a cheap low-end heuristic). This is
  the single biggest GPU lever available for cheap high-DPR devices: DPR 3 → 2 cuts
  fragment work by ~56% with barely visible sharpness loss on a map.
- Note the screenshot code already derives DPR from the canvas backing store, so it keeps
  working with a capped ratio.

### A3. IIIF mask hover forces a full map repaint on every mousemove frame
`src/lib/core/renderers/iiif/iiifMaskInteraction.ts:139–184`

`onMouseMove` → `setHover()` runs per rAF while the pointer moves over the map, and it:

1. calls `map.setFilter(outlineLayerId, …)` for **every** mask sublayer — verified in the
   installed maplibre dist: `Map.setFilter` calls `this._update(true)` → `triggerRepaint()`
   **unconditionally**, even when `Style.setFilter` short-circuits on `deepEqual`;
2. calls `moveOutlineToFront()` → `map.moveLayer(id)` per sublayer — verified:
   `Style.moveLayer` sets `this._changed = true` *before* checking anything, so even a
   layer already on top dirties the style, and `Map.moveLayer` also calls `_update(true)`.
   A dirty style additionally fires `styledata`, which triggers the reconcile listeners in
   B1 below.

Net effect: merely moving the cursor across the map (masks present, nothing hovered)
re-renders the entire map every frame and spams `styledata` → reconcile work. On a low-end
device this is the difference between an idle map and a 100%-GPU map during pointer
movement.

**Suggestion:** track the last applied hover hit (`manifestUrl|imageId|sublayerId`) and the
last applied active filter; return early from `setHover`/`setActive` when unchanged. Only
call `moveOutlineToFront()` when the hover target actually changed (or after reconcile, as
already happens) — never per mousemove. Same guard belongs in `imagePins.ts`'s
`attachImagePinInteraction` mousemove (it calls `queryRenderedFeatures` per frame, which is
CPU work, though it at least doesn't mutate style).

### A4. Self-sustaining `idle` → reconcile → repaint loop (map never sleeps)
`src/lib/app/MapPane.svelte:155–158`, `src/lib/features/images/imagePins.ts:125–203`,
`src/lib/features/images/ImageBrowser.svelte:127–136`, `src/lib/core/map/basemap.ts:283–294`

`MapPane` runs `reconcileOnStyleLoad` on **`styledata` and `idle`** — i.e. after every
style mutation and every time the map settles. That handler ends in unconditionally
style-mutating calls:

- `restoreImagePins(map)` → `source.setData(featureCollection(...))` on **every** call
  (`imagePins.ts:141–153`). `setData` always re-serializes the FeatureCollection, does a
  worker round-trip, re-runs supercluster, and triggers a repaint — there is no "data
  unchanged" guard in MapLibre.
- `applyOverlay(...)` → `setOverlayOpacity` → `map.setPaintProperty(...)` when an overlay
  is active. As with A3, `Map.setPaintProperty` calls `_update(true)` → repaint even when
  the value is unchanged.

Because each of these triggers a repaint, the map re-enters idle afterwards, fires `idle`
again, and the cycle repeats **forever**: serialize pins → recluster in worker → repaint →
idle → again. `ImageBrowser` adds a second `styledata`-driven `syncImagePins` listener on
top. On battery-powered low-end devices this is constant background CPU + GPU drain while
the user does nothing.

**Suggestion:**
- In `restoreImagePins`, keep a revision number in `ImagePinState` (bumped only by
  `syncImagePins`) and the last applied revision per map; skip `setData` when unchanged.
- In `setOverlayOpacity`, read back the current paint value (or cache the last applied
  opacity) and skip the `setPaintProperty` calls when equal.
- Reconsider `idle` as a reconcile trigger at all — `load` + `styledata` should cover
  every case the comment describes; if `idle` must stay, the two guards above make it
  cheap.

### A5. Pin resources are built eagerly and per-cluster-count icons scale O(N)
`src/lib/features/images/imagePins.ts:131–139`, `src/lib/features/images/ImageBrowser.svelte:81–136`

- `ImageBrowser` fetches **all** image-collection indexes + sprite indexes at startup and
  immediately calls `syncImagePins`, which creates the GeoJSON source, two symbol layers,
  and all icons — even though the pins start hidden (`visibility: 'none'` until the panel
  opens). Startup work for a feature the user may never open.
- `restoreImagePins` pre-generates one canvas-rasterized icon **per possible cluster count**
  (`for count = 2..images.length`): with a few hundred images that's hundreds of
  84×48 canvas draws + `map.addImage` texture uploads on the first sync, and it bloats the
  map's sprite atlas permanently.

**Suggestion:** defer `loadImageCollections()` + pin creation until the panel is first
opened (or pins first shown). Replace per-count icons with a single cluster icon plus a
`text-field: ['get', 'point_count_abbreviated']` symbol label — one icon regardless of N.

### A6. Image-browser "in view" recompute per move-frame, even with the panel closed
`src/lib/features/images/ImageBrowser.svelte:91–125`

`updateImagesInView` filters every image through `bounds.contains` and then does a full
`sort` (with `parseInt` per comparison) on every `move` frame while panning. It runs even
when `imageBrowser.panelOpen` is false — the only consumers are the panel list and its
count. On a slow CPU this competes with MapLibre's own per-frame work during pans.

**Suggestion:** gate the whole effect on `imageBrowser.panelOpen`; recompute on `moveend`
instead of `move` (the list is not readable mid-pan anyway); parse years once when the
index loads instead of per comparison.

---

## B. Startup / network — high impact

### B1. The 564 KB Allmaps chunk is parsed at startup even when no warp layer is shown
Import chain: `MapPane.svelte` → `sublayerRendererManager.ts` → `iiifRenderer.ts:3` →
`allmapsWarpRenderer.ts:1` (`import { WarpedMapLayer } from '@allmaps/maplibre'`).

Confirmed in the build output: `nodes/2.js` statically imports the allmaps chunk
(564 KB raw / 153 KB gzip) alongside maplibre (1.0 MB raw / 276 KB gzip). OpenSeadragon
(342 KB / 86 KB) is already correctly lazy via the dynamic import in `IiifViewer.svelte:84`.

On a cheap phone, parse/compile of an extra half-megabyte of JS is main-thread time at the
worst moment (first load), and the warp renderer is only needed once a IIIF sublayer with
a `geomaps` artifact is actually enabled *and* rendered.

**Suggestion:** make `renderIiifAllmapsWarp` load its implementation dynamically —
e.g. `iiifRenderer.ts` keeps the cheap `canRenderIiifAllmapsWarp` check (it only inspects
`target.sublayer.artifacts.geomaps`) and does
`const { renderIiifAllmapsWarp } = await import('./allmapsWarpRenderer')` inside the async
render path. The existing render-token guards already handle the extra await. ~153 KB gzip
off the critical path.

### B2. Render-blocking Google Fonts stylesheet
`src/app.html:6–8`

The `fonts.googleapis.com` stylesheet is render-blocking CSS from a third-party origin —
on a slow connection first paint waits on that round-trip (preconnect helps but doesn't
remove it), and it re-downloads per user rather than living in the app's cache scope.

**Suggestion:** self-host the three faces (Space Grotesk 400, Space Mono 400/700) as
subsetted woff2 in `static/`, declared with `@font-face { font-display: swap }` in
`app.css`, plus `<link rel="preload" as="font">` for the UI face. Removes the external
dependency and the blocking request.

### B3. WMS capability probes for every overlay at startup
`src/lib/features/basemap/mapServiceRegistry.ts:57–66` → `customBasemap.ts`
(`discoverOverlayQueryCapability` → GetCapabilities fetch per WMS overlay)

Every registered WMS overlay triggers a GetCapabilities network fetch during app startup,
even though the result is only needed once the user selects that overlay in the basemap
menu. On slow networks these compete with pmtiles/layer fetches.

**Suggestion:** resolve `query` lazily — probe on first selection of the overlay (cache the
promise), not at registry load.

---

## C. Medium impact

### C1. Zoom/scale indicators do per-frame reactive work during pans
`src/lib/features/map/ZoomIndicator.svelte`, `src/lib/features/map/ScaleIndicator.svelte`

Both subscribe to `move` (fires every frame while panning/zooming). ZoomIndicator writes
Svelte state → DOM text per frame; ScaleIndicator additionally calls
`scaleTrack.getBoundingClientRect()` per frame — a forced layout in the middle of the pan
loop. Cheap individually, but it's DOM layout/paint stacked on top of map rendering on
every frame of every gesture.

**Suggestion:** cache the track width from the existing ResizeObserver instead of measuring
per move; consider throttling both indicators to ~4–8 updates/s (or `moveend` + a rAF
during zoom only). The zoom text only shows one decimal — skip the state write when the
rounded value didn't change (a one-line guard that eliminates almost all updates).

### C2. Infinite SVG dash animation while any timeline layer is active
`src/lib/features/timeline/Meanders.svelte:270–273` (`meander-flow 1.1s linear infinite`)

Animating `stroke-dashoffset` is not compositor-accelerated: the meander SVG repaints on
the main thread every frame, forever, while a layer is active — which is essentially
always. Combined with A4 the app never reaches a truly idle frame. `prefers-reduced-motion`
is honored (good), but low-end users rarely have it set.

**Suggestion:** pause the animation when the tab/timeline is not interacted with, or when
a cheap capability heuristic says low-end (`hardwareConcurrency <= 4`), or drop `infinite`
in favor of the existing one-shot scan pulses. Also note `filter: grayscale(0.6)` on every
inactive meander (`Meanders.svelte:160`) forces those SVGs through a filter pass on each
repaint of the timeline — a `color-mix`-based desaturated stroke color would be free.

### C3. Opening/closing a document destroys and rebuilds a whole MapPane
`src/lib/app/Canvas.svelte:118–135`

`openIiifDocument` sets `leftMap`/`rightMap` to null, unmounting the `MapPane` — a full
`map.remove()`; closing the viewer re-creates the map from scratch: style parse, pmtiles
fetch, IIIF reconcile, warp re-triangulation of visible canvases. On a low-end device
that's seconds of jank for what is visually a panel swap.

**Suggestion:** keep the pane mounted and hide it (`display: none` + skip rendering) while
the viewer occupies its slot, or at least accept this consciously — it's a trade-off
(memory of a live map vs. rebuild cost). Low-end devices generally prefer keeping one map
alive over rebuilding it.

### C4. Image list renders every row; each row paints a crop of the full sprite sheet
`src/lib/features/images/ImageBrowser.svelte:399–420`

The panel renders all `filteredImages` (no virtualization or lazy rendering), each
thumbnail a `background-image` window into the shared sprite sheet. Hundreds of DOM rows
and hundreds of references to a large decoded image inflate layout and raster memory on
low-RAM devices.

**Suggestion:** cheapest fix is `content-visibility: auto; contain-intrinsic-size: …` on
the row, which lets the engine skip layout/paint of off-screen rows; full virtualization
only if lists get into the thousands.

---

## D. Low impact / hygiene

- **Source maps ship with the production build** (`vite.config.ts` `sourcemap: true`;
  ~7 MB of `.map` in `build/`). No runtime cost, but if the host serves the whole folder
  they're publicly fetchable and inflate deploys. Consider `sourcemap: 'hidden'` or CI-only.
- **Hot-path logging:** `iiifRenderer.ts` `console.info` on every sublayer render and the
  addSprites info logs in `allmapsWarpRenderer.ts` run in production. Trivial cost, but
  gate on `allmapsOptions.diagnostics` for symmetry.
- **`createGrid`** (`basemap.ts:97–137`) generates a few thousand line features per map
  init — fine once, just don't be tempted to call it on style changes.
- **`syncResponsivePinScale`** calls `getComputedStyle(document.documentElement)` per
  reconcile pass (`imagePins.ts:37–41`); cache the root font size and refresh on resize
  only (it already has a resize hook).

---

## What already looks right (no action)

- OpenSeadragon is dynamically imported only when a document opens.
- The Allmaps warp path is heavily and thoughtfully tuned: viewport-driven load/evict
  margins, `RECONCILE_CHUNK` frame-spread triangulation, pruned sprite caches, tuned
  prune/overview buffer ratios, `ALLMAPS_TRIGGER_ZOOM` with a raster preview below it.
- Search index loads lazily on first open of the search menu.
- URL persistence is debounced (400 ms) and uses `replaceState`.
- `geomaps.json` fetches are promise-cached; `moveLayer` storms in the reconciler are
  signature-guarded (`applyLayerOrder`); pane resize uses a ResizeObserver.
- No `backdrop-filter` anywhere; scan-path animation is one-shot; `prefers-reduced-motion`
  is respected in both animated components.
- Manual vendor chunking keeps maplibre/allmaps/OSD cacheable independently of app code.

---

## Suggested order of attack

| # | Change | Effort | Expected win on low-end |
|---|--------|--------|-------------------------|
| 1 | Cap `pixelRatio` at 2 + finite `maxCanvasSize` (A2) | tiny | Largest GPU win on high-DPR budget devices |
| 2 | Guard `setHover`/`moveOutlineToFront` against no-op re-application (A3) | small | Stops per-mousemove full repaints |
| 3 | Break the idle→setData/setPaintProperty→repaint loop (A4) | small | App actually idles; battery + thermal |
| 4 | Drop `preserveDrawingBuffer`, verify screenshots (A1) | small + test | Per-frame GPU copy removed |
| 5 | Dynamic-import the Allmaps warp renderer (B1) | small | −153 KB gzip / −564 KB parse at startup |
| 6 | Defer image collections + single cluster icon with text label (A5) | medium | Faster startup, smaller sprite atlas |
| 7 | Gate ImageBrowser in-view recompute on panel open + moveend (A6) | tiny | Smoother pans |
| 8 | Self-host fonts (B2), lazy WMS probes (B3), indicator throttling (C1) | small each | First-paint and pan smoothness |
