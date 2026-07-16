# Low-End Performance — Staged Implementation Plan

Companion to `LowEndPerformanceAudit.md`. Each segment is a small, self-contained change
set I implement; after each one you run the listed manual checks before we move on. Order
is chosen so the riskiest-to-verify changes come when everything else is stable, and each
segment is trivially revertable on its own.

**Parked (your call, not in these segments):** `maxCanvasSize: [Infinity, Infinity]` →
`[4096, 4096]` waits for the Allmaps patch you're tracking. Nothing below depends on it.

---

## Segment 1 — Stop redundant style mutations in the hover path (audit A3)

**Changes** (`iiifMaskInteraction.ts`, `imagePins.ts`):
- `setHover`: remember the last applied hover hit; return early when the new hit is
  identical (including the null→null case, which is nearly every mousemove frame).
- `setActive`: same guard on the last applied active mask.
- `moveOutlineToFront()`: called only when the hover/active target actually changed and
  from reconcile — never per unchanged mousemove frame.
- `attachImagePinInteraction` mousemove: skip the second `queryRenderedFeatures` when the
  first already resolved the cursor state (minor CPU trim, same guard style).

**Your tests afterwards:**
- Hover over IIIF sheets: outline appears on the right sheet, follows the topmost/smallest
  rule, disappears on hover-off and on `mouseout` (leave the map).
- Click a sheet → viewer opens; active-selection outline/fill still tracks the open document.
- Hover/click image pins (with the Landscapes panel open): pins still win over masks,
  cursor changes correctly.
- Sanity in DevTools Performance: with the cursor moving over the map but not crossing any
  sheet boundary, the map should no longer repaint every frame.

---

## Segment 2 — Break the idle → reconcile → repaint loop (audit A4)

**Changes** (`imagePins.ts`, `basemap.ts`):
- `ImagePinState` gets a revision counter bumped only by `syncImagePins`; `restoreImagePins`
  records the revision it applied per map and skips `setData` when nothing changed.
- Icon/layer creation in `restoreImagePins` already has `hasImage`/`getLayer` guards — keep,
  but move the legacy-icon cleanup loop behind a once-per-map flag.
- `setOverlayOpacity`: cache the last applied opacity per map (WeakMap) and skip the
  `setPaintProperty` calls when equal.

**Your tests afterwards:**
- Pins: open/close the Landscapes panel, toggle collections, pan/zoom — pins and cluster
  counts stay correct, clusters expand on click.
- Switch meanders/sublayers (adds/removes IIIF layers) — pins re-appear above new sheets.
- Overlays: select one, drag the opacity slider (must still respond live), click for
  feature info, switch overlay, remove overlay.
- The key verification: leave the app completely idle for ~30 s with pins + an overlay
  active; in DevTools Performance the timeline should be flat (no recurring worker/render
  activity).

---

## Segment 3 — Image browser cost gating (audit A5 + A6)

**Changes** (`ImageBrowser.svelte`, `imagePins.ts`):
- Defer `loadImageCollections()` and the first `syncImagePins` until the panel is first
  opened (pins are invisible until then anyway; search already lazy-loads the same shared
  promise, so search is unaffected).
- Gate the in-view recompute effect on `imageBrowser.panelOpen`; recompute on `moveend`
  instead of every `move` frame; parse each image's year once at load time.
- Replace per-cluster-count icons with one cluster icon + a `text-field` symbol label
  (`point_count_abbreviated`), styled to match the current look.
- `content-visibility: auto` + intrinsic size on image list rows.

**Your tests afterwards:**
- Fresh load: no image-index fetches in the Network tab until the panel opens.
- Open panel: list populates, "shown/total" counts update after pans (on settle, not
  during), year + collection filters work.
- Cluster icons: counts render correctly at all cluster sizes (2, double digits, 100+),
  visually acceptable vs. before.
- Search → image result → preview bubble → open document still works with the panel never
  having been opened.

---

## Segment 4 — Lazy-load the Allmaps warp renderer (audit B1)

**Changes** (`iiifRenderer.ts`, `allmapsWarpRenderer.ts`):
- Move the `canRenderIiifAllmapsWarp` check into a tiny synchronous helper (it only reads
  `artifacts.geomaps`) and load the rest via `await import('./allmapsWarpRenderer')` inside
  the async render path. Existing render tokens already guard the extra await.

**Your tests afterwards:**
- Network tab on fresh load: the allmaps chunk must **not** load until a IIIF sublayer
  renders (default meander active at start → it will load shortly after boot, but off the
  critical path; verify initial paint feels snappier on a throttled CPU profile).
- Warp behaviour unchanged: zoom past the trigger zoom, sheets warp in, compare mode works,
  rapid meander toggling doesn't resurrect removed layers.

---

## Segment 5 — Drop `preserveDrawingBuffer` (audit A1)

**Changes** (`maplibreInit.ts`): remove `canvasContextAttributes.preserveDrawingBuffer`
(one line; the screenshot path already reads inside a `render` event).

**Your tests afterwards** (this segment is *only* about screenshots — everything else
cannot regress from it):
- Screenshot in single mode, compare mode, with a document viewer open, with pins and an
  overlay visible — on Chrome **and** Safari (Safari is the likely place a regression
  shows as a black/blank map in the PNG). If any export comes out blank, we revert the
  line and mark A1 as "blocked by browser".

---

## Segment 6 — Cap devicePixelRatio at 2 (audit A2, DPR half only)

**Changes** (`maplibreInit.ts`): `pixelRatio: Math.min(window.devicePixelRatio, 2)` on the
Map constructor. Independent of the parked `maxCanvasSize` change, but if you'd rather
bundle both behind the Allmaps patch, this segment just waits with it.

**Your tests afterwards:**
- On your Retina display: map/label/warp sharpness acceptable (this is the one subjective
  check in the plan — DPR 2 on a DPR-2 display is a no-op; you'd need a DPR-3 device or
  browser zoom tricks to see any difference).
- Screenshot export still comes out at the expected resolution (the capture derives DPR
  from the canvas backing store, so it should adapt automatically — verify dimensions).

---

## Segment 7 — Startup network + UI polish (audit B2, B3, C1)

**Changes:**
- Self-host subsetted woff2 for Space Grotesk 400 / Space Mono 400+700 in `static/fonts/`,
  `@font-face` with `font-display: swap` in `app.css`, preload the UI face, drop the
  Google Fonts links from `app.html`.
- `mapServiceRegistry`: resolve overlay `query` capability lazily on first selection
  (cached promise) instead of probing every WMS overlay at startup.
- `ScaleIndicator`: track width from the existing ResizeObserver instead of
  `getBoundingClientRect` per move; `ZoomIndicator`: skip the state write when the rounded
  value is unchanged.

**Your tests afterwards:**
- Fonts render identically (compare timeline labels, mono UI text, bold weights); no FOUT
  worse than before; Network tab shows no `fonts.googleapis.com` / `gstatic` requests.
- Overlays: first selection of a WMS overlay still enables feature-info clicks (now with a
  short first-time delay); error states still surface in the bubble.
- Zoom/scale indicators still track pans and zooms correctly, including after resizes.

---

## Not scheduled (discuss before doing)

- **C2** (infinite meander dash animation) — visual-design tradeoff; needs your call on
  pausing vs. removing `infinite`.
- **C3** (keep MapPane alive while the viewer occupies its slot) — bigger refactor of
  Canvas pane-swap logic; worth its own plan once the cheap wins are in.
- **D items** (sourcemaps off in prod builds, log gating, root-font-size caching) — can be
  folded into any segment on request.

---

## Working agreement

- One segment per commit (or small commit series) on `ref/viewerV2`, so any regression you
  find in testing maps to exactly one revertable change.
- I run `pnpm check` + a production build after each segment before handing over.
- You test; anything degraded → I fix or revert that segment before starting the next.
