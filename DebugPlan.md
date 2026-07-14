# Conclusion 4 — Final: IIIF/Allmaps High-Zoom Progressive Freeze

**Status:** Final. Compounds `conclusion1.md` (Agent B, app-side residency), `conclusion2.md` (Agent A, `@allmaps/render` internals) and the consensus reached in `conclusion3.md` (Agent B: `SIGNAL: AGREE round=1`).
**Constraint acknowledged:** we are in contact with the Allmaps maintainers, but we will **not** fork the Allmaps source. Upstream defects are handed to the maintainers as a precise report; the only local library-side option, if we want one before an upstream release, is `pnpm patch` (a versioned local patch applied at install — removable the moment upstream ships a fix; no fork involved). Everything else in the plan is our own application code.

---

## 1. Final diagnosis (agreed by both agents)

**Symptom:** IIIF layer active, zoom past `ALLMAPS_TRIGGER_ZOOM` (12.5) so georeferenced canvases stream in. Initially smooth; then a non-deterministic stutter appears, worsens progressively until the app — and the host system — is nearly frozen. Zooming out resolves it instantly.

The problem has **two compounding axes**:

### Axis 1 — In-viewport overdraw × per-pixel tile scan (the freeze; instant zoom-out relief)

Per-frame GPU cost of the Allmaps layer:

```
Σ over canvases DRAWN ( screen pixels covered × tile-texture-array depth × ~5 texelFetches )
```

- Allmaps' map fragment shader scans the canvas's **entire** cached-tile texture array **per pixel** — a linear loop, no spatial lookup (`@allmaps/render/dist/shaders/map/fragment-shader.js`).
- At high zoom one canvas covers the whole screen and honestly needs ~100–180 tiles at dpr 2 (matches our July 2026 diagnostics).
- `WebGL2Renderer.#renderMapsInternal()` draws **every** map in `mapsWithFetchableTilesForViewport` back-to-front with no occlusion culling → **K overlapping in-viewport canvases multiply the full cost by K**, even when completely hidden behind the topmost one.
- Progression: our reconciler (`allmapsWarpRenderer.ts#reconcileViewport`) only ever adds canvases; `drainQueue` triangulates them 6/frame and each canvas's texture array deepens from 1 (sprite) to ~120 as tiles arrive. Onset depends on network timing and local canvas density → "non-consistent".
- Zoom-out relief is instant because pixels-per-canvas collapses immediately; no cache/GC involved.
- Key correction agreed in conclusion3: canvases that scrolled **offscreen are not drawn** and do not contribute frame time — they contribute to Axis 2 only. **Eviction alone therefore cannot fix the freeze in dense overlap areas.**

### Axis 2 — GPU resource retention and leaks (host-system-wide slowdown; the progressive background)

Confirmed in the installed `@allmaps/render@1.0.0-beta.83`:

1. **PBO leak** — `WebGL2WarpedMap.updateTextures()` creates one PBO per tile per texture rebuild and never calls `gl.deleteBuffer`. Rebuilds fire per visible map up to every 200 ms while tiles stream in → tens of MB/s of GPU memory leaked during high-zoom panning. Tiny JS wrappers give the GC no pressure signal, so VRAM balloons far ahead of collection.
2. **Vertex-buffer leak** — `shared/webgl2.js#createBuffer` allocates fresh buffers on every `updateVertexBuffers*` call (every viewport re-entry); previous buffers are dropped unreferenced, never deleted.
3. **No texture release for resident maps** — `clearTextures()` is an empty no-op and `updateTextures()` skips rebuilds when the tile set only shrinks (`subSetArray` check), so every canvas ever viewed at high zoom keeps its ~30–120 MB texture array until the map is destroyed. Verified: `removeGeoreferencedMapById()` → `warpedMap.destroy()` is the only effective release path reachable from the app.
4. Secondary ratchets: `TileCache.tileRemoveQueue` (cap 100) drains only on overflow, one per push; `recursivelyGetTilesAtLower/HigherScaleFactor` passes `log2ScaleFactorDiff--` (post-decrement — the recursion bound never decrements).

VRAM over-commit forces WDDM texture paging per frame, starving the Windows compositor — which is why the **whole machine** janks, not just the tab.

### Ruled out

info.json refetch storm (pre-seeded via `addImageInfos`; would worsen on zoom-out, contradicting observed relief); tile fetch-error retry storm (failed tiles are never retried); `TEXTURESUPDATED → CHANGED → triggerRepaint` feedback loop (converges); app-side per-frame CPU work (small constants).

---

## 2. Action plan

### Phase 0 — Confirm before coding (½ day, no code changes)

1. Enable `allmapsDiagnostics`. The module (rewritten 2026-07-14) now measures both axes directly, so Task Manager's dedicated-GPU-memory column is only an external cross-check. It logs two lines per 2 s window (`render` = Axis 1, `gpu` = Axis 2) and mirrors the latest sample to `window.__allmapsDiag[label]` for comparing knob-test runs.
2. Reproduce: 2–3 minutes of high-zoom panning over a dense area. Expected signatures:
   - **Axis 1:** jank onset tracks `scan` (Σ over drawn maps of projected device-pixel coverage × texture-array depth) and `overdraw` > ~2x, and the worst-frame snapshot (`worst=…ms@drawnK/ΣdepthD`) shows high drawn/depth at the moment of the stall → **Axis 1 confirmed**.
   - **Axis 2:** on the `gpu` line, `buf live` count/bytes (especially the `pbo` subset — PIXEL_UNPACK is Allmaps-only) climbs with `gc` lagging `Δ+created`, and `tex≈…MB` staircases as new areas are visited while `shrinkLag` grows (texture depth retained beyond tile-cache pruning) → **Axis 2 confirmed**. The live-buffer gauges account for GC-freed buffers via FinalizationRegistry, so a monotonic climb is real retention, not GC lag.
3. Knob test: set `log2ScaleFactorCorrection: 1` in the Advanced Allmaps developer menu (~4× fewer tiles per fullscreen canvas). If the freeze threshold moves by roughly that ratio, Axis 1 is confirmed end-to-end. This knob is also the **immediate stopgap** we can ship behind a setting if relief is needed before Phase 1 lands (sharpness cost ≈ rendering at dpr 1).

### Phase 1 — Cap in-viewport overdraw (our code; fixes the freeze) — highest priority

-> This phase is dangerous!! never implement without asking the user, it assumes that canvases always fully overlap which tehy do not.

In `allmapsWarpRenderer.ts`, on `moveend` (same place as `reconcileViewport`):

- Compute loaded canvases intersecting the current viewport, sort by z/layer order.
- **Conservative first pass (per conclusion3 Round 2):** allow only the top **N** renderable, `layer.setMapsOptions(occludedIds, { renderMaps: false })` for the rest; re-enable when they surface. Make N a developer-menu knob for diagnostics (start N = 3–4).
- Guard rails: skip the cap whenever the UI intentionally needs lower canvases visible — blended opacity < 1, `debugTriangles`, high-stretch visualization, compare modes.
- Later refinement (optional): replace top-N with a real coverage test (stop descending the stack once cumulative opaque mask coverage exceeds the viewport).

**Acceptance:** with N capped, jank no longer correlates with `drawnPerFrame` in dense areas; no visible difference in normal viewing.

### Phase 2 — Bounded residency / eviction with hysteresis (our code; fixes memory retention)

From conclusion1, validated in conclusion2/3:

- Track the mapId returned by each `layer.addGeoreferencedMap()` (keyed by canvas `imageId`).
- Define an **eviction viewport strictly larger than the load viewport** (e.g. load margin 0.15 → eviction margin ≥ 1.0) so ordinary pans don't thrash remove/re-add (re-adding re-pays triangulation).
- On `moveend`, evict canvases outside the eviction bounds via `layer.removeGeoreferencedMapById(mapId)`, remove them from `loadedCanvasIds` so they can reload later, then `layer.nativeUpdate()`.
- Note: sprite re-upload for re-entering canvases goes through the existing per-drain batch path; verify sprites reattach after re-add (they should — `addSprites` binds against the then-current warped-map list).

**Acceptance:** GPU memory across a long high-zoom session stays bounded (sawtooth, not staircase); revisiting an evicted area re-renders correctly.

### Phase 3 — Upstream: hand the maintainers a precise defect report (no fork)

Since we're already in contact with the Allmaps makers, send them the list below — each item has an exact location and a small, low-risk fix they can apply directly. Recheck against their current `main` right before sending (our verification was against `@allmaps/render@1.0.0-beta.83`, the latest release at the time of writing, and `main` as of 2026-07-13).

1. **PBO leak** — `packages/render/src/maps/WebGL2WarpedMap.ts`, `updateTextures()`: `gl.createBuffer()` per tile per rebuild, never `gl.deleteBuffer(pbo)`. Fix: one line after the `bindBuffer(PIXEL_UNPACK_BUFFER, null)`. Highest impact.
2. **Vertex-buffer leak** — `packages/render/src/shared/webgl2.ts`, `createBuffer()` callers discard prior buffers without deleting them. Suggested fix: read the attribute's current binding via `gl.getVertexAttrib(location, VERTEX_ATTRIB_ARRAY_BUFFER_BINDING)` (caller's VAO is bound) and delete it before creating the replacement.
3. **`clearTextures()` is a no-op** — maps leaving the viewport keep their full texture arrays; only `destroy()` frees them. Ask for an implementation (or a public API to release/rebuild per-map GPU textures).
4. **Texture arrays never shrink** — `updateTextures()` early-returns when the new tile set is a subset of the previous (`subSetArray`), so pruning never reduces shader-scan depth.
5. **`TileCache.tileRemoveQueue`** (cap 100) drains only on overflow, one entry per push — pruning permanently lags.
6. **Post-decrement bug** — `packages/render/src/shared/tiles.ts`, `log2ScaleFactorDiff--` passed to the recursive calls decrements *after* passing, so the recursion bound never decreases.
7. **The structural issue (feature request):** per-pixel linear scan over the tile texture array in the map fragment shader; and full `texImage3D` reallocation + total re-upload on every tile change. Ask about a spatial tile-index lookup and incremental `texSubImage3D` updates — this is the real long-term fix for high-zoom performance and only Allmaps can do it.

**Interim, only if Phase 0 shows Axis 2 dominates and upstream turnaround is slow:** apply item 1 (the single `gl.deleteBuffer(pbo)` line) locally via `pnpm patch @allmaps/render@1.0.0-beta.83`. This is not a fork — it's a diff in `patches/` applied at install, trivially deleted when upstream releases. Items 2–7 we do **not** patch locally; they go upstream only.

### Phase 4 — Verify and lock in

1. Re-run the Phase 0 protocol after each phase lands; keep the diagnostics module until all acceptance criteria pass twice.
2. Acceptance for done: 2–3 min dense-area high-zoom panning with (a) no frame > ~100 ms after warm-up, (b) GPU memory bounded, (c) no host-system impact.
3. When Allmaps ships fixes: bump `@allmaps/maplibre`/`@allmaps/render`, delete the `pnpm patch` if we made one, re-run Phase 0, and consider relaxing the tuned knobs (`pruneViewportBufferRatio` etc.) that exist mainly to compensate for these defects.
4. Then delete `iiifAllmapsDiagnostics.ts` (it is marked temporary) and record the outcome in `DECISIONS.md`.

### Ownership summary

| Fix | Where | Who | Effort |
|---|---|---|---|
| Overdraw cap (top-N) | `allmapsWarpRenderer.ts` | us | ~1 day + tuning |
| Eviction w/ hysteresis | `allmapsWarpRenderer.ts` | us | ~1 day |
| `log2ScaleFactorCorrection` stopgap | dev-menu setting | us | minutes |
| PBO leak (+ items 2–7) | `@allmaps/render` | Allmaps maintainers (report ready above) | 1-line for item 1 |
| Interim PBO patch (optional) | `pnpm patch` | us | minutes, removable |
| Shader spatial lookup / incremental uploads | `@allmaps/render` | Allmaps maintainers (feature request) | theirs |
