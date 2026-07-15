# Stutter root cause: CPU-side churn, not VRAM pressure

*2026-07-15. Follow-up to DebugFindings.md / TileGridComparison.md. Branch state at time of
measurement: PBO-leak patch applied, manual eviction active, 512px tile override, sequential
per-canvas sprites. Log excerpts below are from the `[allmaps-diag]` session on the
PrimitiefKadaster layer (Firefox, 3754×2650 canvas @2dpr).*

## Hypothesis

The stutters that remain after the PBO and eviction fixes are not caused by GPU memory
pressure. They are caused by the CPU-side churn of Allmaps' texture-update model: every new
tile triggers a full recalculation and re-upload of its map's texture array, and the same
pan/zoom bursts that trigger those rebuilds also manufacture large volumes of short-lived
objects that the garbage collector must clean up. The stutter is the sum of two CPU costs —
synchronous rebuild work and GC pauses — firing at the same moments.

## What the logs rule out: VRAM pressure

Texture residency never left double digits of MB, and buffer memory is negligible:

```
textures=20MB … 105MB across 5–105 maps      (whole session)
buffers: live≈800–1,565 (1–5MB) pbo=0 (0MB)  (every window)
```

A discrete GPU has GBs of VRAM; the observed peak (~105 MB textures + 5 MB buffers) is ~5% of
even a modest 2 GB budget. Live PBOs are zero in every window (leak fix confirmed working), and
eviction keeps resident maps bounded (`loaded` falls 195 → 9 while panning at high zoom).
Nothing here can produce memory-pressure stalls. The observation "VRAM usage is low" is
correct — capacity is not the problem.

## Component 1 — synchronous rebuild work (the recalculation itself)

**Semantics.** `WebGL2WarpedMap.updateTextures()` skips work only when *no new tile* arrived
(subset check). Any new tile ⇒ full path: regenerate the tile list from scratch, reallocate the
texture array (`texImage3D`), re-upload **every** layer through a fresh PBO (~1 MB memcpy per
layer on the main thread), rebuild both metadata textures. Throttled to one rebuild per 200 ms
*per map*. While tiles stream, each active map re-uploads its whole array up to 5×/s to add
1–2 tiles per rebuild.

**Log evidence.** In every active window, PBO upload volume equals texture-realloc volume —
i.e. *all* upload traffic is full rebuilds, none is incremental:

```
uploads: pbo=123MB texRealloc=51 (123MB)     z=15.16, panning
uploads: pbo=302MB texRealloc=51 (302MB)     z=15.49, after zoom-in
uploads: pbo=191MB texRealloc=139 (191MB)    z=12.71, zoom-out reveal (105 maps × depth 1)
```

Two regimes, matching TileGridComparison.md:

- *High zoom:* few maps, deep arrays (depth 20–25) — each rebuild re-uploads 20–25 MB to add
  ~1 MB. Worst frames land inside these windows: `worst=110ms` @ 137 MB, `worst=240ms` @ 92 MB.
- *Low zoom:* ~105 maps at depth 1 — rebuilds are individually cheap but 139 of them fire in
  2 s, each paying fixed per-map overhead (GL calls, driver validation, list regeneration).

This component is not GC — it is raw synchronous work (memcpy + ~3 GL calls per layer) that
blocks the frame directly.

## Component 2 — GC of the per-tile decode pipeline

**Semantics.** Every arriving tile churns, in the decode worker and main thread:

| Object | Approx. size | Fate |
|---|---|---|
| `Blob` (compressed webp) | 50–200 KB | garbage after decode |
| `ImageBitmap` | ~1 MB native | **never `close()`d** — freed only when GC finds the wrapper |
| `OffscreenCanvas` | ~1 MB native | **allocated per tile**, garbage immediately |
| `ImageData` | ~1 MB | transferred to main thread, dies when the tile is pruned/evicted |
| comlink/fetch temporaries | small | garbage per call |

≈3 MB of mostly native-backed allocation per tile, owned by tiny JS wrappers — the worst case
for a GC, which sees ~100 bytes of "cost" per megabyte held. Rebuilds add ~90 small objects
each (URL arrays, metadata arrays, `WebGLBuffer` wrappers, Map entries): high count, low
weight — nursery fodder, not the pause source.

**Log evidence.** Tile influx implies allocation rate: `real+392` in one 2 s window ≈ 200
tiles/s ≈ **600 MB/s of churn** at reveal peaks. Collection visibly lags allocation and lands
in batches:

```
gc=581   gc=210   gc=168   gc=140      (buffer wrappers collected in bursts, not steadily)
```

And the smoking gun — a major stall in a window with **zero uploads and zero tile activity**,
i.e. nothing left to blame but collection of the preceding burst's garbage:

```
buffers: created+0 deleted-0 gc=0 | uploads: pbo=0MB texRealloc=0 (0MB) |
tiles: real+0 sprite+0 errors=0 | frames: 125 jank=1 worst=320ms
```

The neighbouring quiet-ish windows (`worst=250ms` at low activity) fit the same pattern:
GC pays for the burst *after* the burst.

## Why the two components look like one problem

Both are triggered by the same event — a pan/zoom revealing tiles — and interleave on the
timeline: during the burst, frames are lost to rebuild memcpy + minor GC; for seconds
afterwards, frames are lost to major GC of the decode garbage. From the outside it reads as
"stutter around movement," which is why it was tempting to attribute it to one cause (VRAM or
GC alone). The logs separate them: worst-frames *with* high `pbo` MB are Component 1;
worst-frames in *quiet* windows are Component 2.

## Falsifiable predictions

1. Firefox Profiler: worst frames during bursts show `texSubImage3D`/`bufferData` stacks;
   worst frames in quiet windows overlap GC Major / Cycle Collection markers.
2. Raising the 200 ms throttle (e.g. 4×) shrinks Component 1's jank roughly proportionally
   without touching Component 2's post-burst stalls.
3. Patching the worker (`imageBitmap.close()` + one reused `OffscreenCanvas`) cuts ~2/3 of
   per-tile native churn and should visibly shrink the post-burst stalls, with zero visual
   change.

## Fix mapping (see conversation of 2026-07-15)

| Fix | Attacks | Cost |
|---|---|---|
| Slot allocator (stable `tileUrl → layer`, `texSubImage3D` new tiles only, sentinel-skip holes, viewport-derived capacity cap) | Component 1, ~95% of upload volume | one method in the existing `@allmaps/render` patch; shader unchanged |
| Worker hygiene: `close()` bitmaps, reuse one `OffscreenCanvas` | Component 2, ~2/3 of per-tile churn | few lines in the inline worker string, same patch |
| Throttle/coalesce rebuilds (also fixes the low-zoom 100-map regime) | Both | one constant / small scheduling change |
| `ImageData` pooling | Component 2 remainder | risky (transfer ownership); only if still needed after the above |

Success signature after the slot allocator lands: `pbo MB ≈ (new tiles × 1 MB)` per window and
`texRealloc → ~0` during pans — breaking the `pbo ≡ texRealloc` equality that currently
fingerprints the churn.
