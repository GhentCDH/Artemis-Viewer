# Phase 0 Findings — IIIF/Allmaps High-Zoom Diagnostics (2026-07-14)

Companion to `DebugPlan.md`. Results from two instrumented benchmark runs with the rewritten
`iiifAllmapsDiagnostics.ts` (per-frame scan-cost estimation, WebGL buffer/PBO accounting with
FinalizationRegistry-backed GC crediting, texture-VRAM residency, worst-jank-frame snapshots).

**Setup:** macOS, Firefox, 3388×2650 canvas @ dpr 2, `GereduceerdeKadaster` layer (~92 canvases
loaded in run 1, ~37 in run 2), 512×512 tiles, tuned knobs active (`log2ScaleFactorCorrection 0`,
`pruneViewportBufferRatio 2`, overview tiles disabled). Zoom range exercised: ~z12.7–15.5.
Note: the historical "whole machine freezes" report is from a Windows/WDDM machine; this Mac has
more VRAM headroom, so memory-pressure symptoms are expected to be milder here.

---

## Verdict per axis

### Axis 2 (GPU retention / churn) — CONFIRMED, dominant

- **PBO balloon:** live PBO bytes repeatedly ballooned and collapsed in a sawtooth —
  105 MB → 674 MB (run 1), peaking at **836 MB with zero GC in that window** (run 2). Only wrapper
  GC ever reclaims them (`gc` bursts of 200–460 buffers), lagging allocation by tens of seconds.
  On a VRAM-constrained Windows machine this over-commit is exactly what forces WDDM paging.
- **Upload churn:** up to **456 MB of PBO uploads and 43–62 full texture-array reallocations per
  2 s window** (~230 MB/s). Every arriving tile re-triggers a full-array re-upload of its map
  (200 ms throttle), so churn scales with (maps × tiles in flight), not with what changed.
- **Post-activity digestion:** after panning stopped completely, live PBOs drained
  401 → 96 → 6 → 0 MB through pure GC over ~10 s, and **390–470 ms main-thread stalls persisted
  during windows where Allmaps did literally nothing** (no uploads, no tiles, no buffer traffic).
  The "lag persists after you stop" symptom is garbage digestion / memory pressure, not render cost.

### Axis 1 (overdraw × per-pixel tile scan) — NOT confirmed at tuned depths

- With the tuned knobs, texture depth stayed ≤ 41 per map (vs. the 100–180 measured before
  tuning). Estimated scan cost never exceeded **0.54 G texel·layers/frame** even with a
  full-screen canvas (9.0 Mpx) at overdraw 3.4×.
- Windows with *constant* scan (0.51 G, camera static) had jank varying 0–2 frames — the stalls
  do not track fill cost on this machine. Worst frames (450–770 ms) always coincided with high
  `Δupload pbo` / `tex3D` churn or `gc` bursts instead.
- Open: this may still bite on weaker GPUs or if the tuning knobs regress; re-check on the
  Windows repro machine before closing Axis 1 permanently.

---

## New findings beyond the original diagnosis

1. **Every loaded map is drawn every frame (`drawn == loaded`, e.g. 92 drawn with 8 in
   viewport).** Verified in `@allmaps/render@1.0.0-beta.83` source: `BaseRenderer.
   requestFetchableTiles()` unconditionally appends the sprite tiles of every renderable map to
   `allFetchableTilesForViewport`, which becomes `mapsWithFetchableTilesForViewport` — the exact
   set `#renderMapsInternal()` draws back-to-front. Since every canvas has a sprite tile, the
   draw list equals the full loaded set, permanently. Offscreen maps cost ~no fragment work
   (clipped) but per-map draw-call/vertex overhead grows monotonically with pan history and
   never shrinks. Corrects conclusion3's "offscreen canvases are not drawn" (wrong for
   sprite-backed maps). → new **upstream report item 8**; also strengthens Phase 2 (eviction
   shrinks the draw list itself, not just memory).

2. **Zoom-out transitions are a one-time churn bomb — but self-resolving.** A zoom-level change
   re-tiles every loaded map at the new scale factor at once; each map's throttled
   `updateTextures` does a full-array re-upload with fresh (leaked) PBOs per tile. Measured:
   456 MB uploads / 43 reallocs in one window, jank 9, worst 740 ms, PBO live → 836 MB. The spike
   is transient and resolves once re-tiling settles, so it is *not* the progressive freeze — but
   it is the strongest single illustration for upstream items 1 (PBO delete) and 7 (incremental
   `texSubImage3D`), and it feeds the GC-digestion stalls above.

3. **Depth creeps while stationary.** At a fixed viewport (z 15.51) the top map's depth climbed
   17 → 21 → 26 → 31 (41 after a small zoom change) as tiles at neighbouring scale factors
   arrived, each arrival re-triggering a rebuild. A static viewport keeps paying upload churn for
   tens of seconds after movement stops.

4. **App-side: superseded renders leak a ghost (our bug, pollutes benchmarks).**
   `renderIiifSublayer` bumps the render token via `beginIiifRender` but never runs the previous
   render's cleanups (only `removeIiifSublayer` does). A re-render of the same sublayer therefore
   leaves the old `moveend` handler, rAF loop, report timers, and diagnostics alive. Symptom in
   the logs: alternating `drawn=0 … loaded=N` / `drawn=N` report pairs — the ghost's moveend
   still queues canvases (its `loadedCanvasIds` grows) but its `drainQueue` aborts on the token
   check, so it never adds a map. **When reading logs, trust only `render` lines with
   `drawn>0`;** `gpu` lines are shared-counter duplicates either way. Fix: run pending cleanups
   on re-render, not only on removal.

## Ruled out / deprioritised by this data

- Fill-rate (Axis 1) as the primary stall source on this hardware → **Phase 1 (top-N occlusion
  cap) demoted** below Phase 2 and the PBO patch.
- `shrinkLag` stayed 0 throughout — texture arrays tracked cache counts in these runs; the
  never-shrink defect (upstream item 4) did not manifest at tuned prune ratios.

## Updated priorities

| # | Action | Basis |
|---|---|---|
| 1 | Fix the ghost-cleanup leak in `iiifRenderer.ts`/`iiifLayerRuntime.ts` | clean future benchmarks; removes stray per-pan work |
| 2 | Apply the interim `pnpm patch` adding `gl.deleteBuffer(pbo)` in `WebGL2WarpedMap.updateTextures` | directly caps the 836 MB balloon and shortens post-pan GC digestion; promoted from "only if" |
| 3 | Phase 2 eviction with hysteresis | bounds resident set **and** the draw list (finding 1) |
| 4 | Send upstream report: items 1–7 **plus new item 8** (sprite tiles force all maps into the render set) and the zoom-out churn measurement as evidence for item 7 | |
| 5 | Re-run this protocol on the Windows repro machine (and the `log2ScaleFactorCorrection: 1` knob test, still not done) before closing Axis 1 | different VRAM/GPU envelope |
| 6 | Phase 1 top-N overdraw cap | only if Windows data shows scan-correlated jank |

## Raw signatures for reference

- Run 1 (pan tour, 92 canvases): PBO live 105→674 MB sawtooth; worst frames 450/520/530 ms in
  high-churn or high-GC windows, including one at scan≈0 right after zoom-out; scan ≤ 0.23 G.
- Run 2 (dense area z15.5, then full stop): stationary depth creep 17→31; scan plateau 0.51 G
  with jank 0–2; zoom-out spike 456 MB/43×, worst 740 ms; post-stop GC digestion with 390–470 ms
  stalls for ~10 s, then quiet.
