# Changes Made — IIIF/Allmaps Performance (2026-07-14)

Companion to `DebugPlan.md` / `DebugFindings.md`. Log of trace observations, retained fixes, and
performance experiments that were subsequently rejected.

## Trace at start of day

Profiling a sequential IIIF manifest render:

- **Image decode bottleneck:** over 3.5s of rendering, nearly 1s was spent decoding images.
  Hypothesis: caused by always passing the full shared sprite sheet to Allmaps even in sequential
  mode, which only ever needs one sprite at a time — `addSprites` treats its image as a single
  tile, so the whole sheet gets fetched *and decoded* just to crop out a handful of sprites per
  drain batch. Splitting sprites per-canvas should keep the fetch cost (small, cheap) but drop the
  decode cost (the sheet is huge, one sprite is tiny).
- **Memory bottleneck:** memory usage was too high even accounting for a 4K screen. Flagged for
  follow-up: try the Allmaps advanced developer-menu tuning knobs and compare.

## Fix 1 — per-canvas sprite files (sequential mode)

Sequential mode now resolves each canvas's own small sprite `.webp` (new build artifact,
`sprite.file`) instead of decoding the shared sheet — see `iiifSpriteAtlas.ts` (`loadSpriteIndex`)
and `allmapsWarpRenderer.ts` (`uploadSpritesFromPerCanvasFiles`). Eager mode is unchanged (still
uses the shared sheet — one decode amortized across every canvas up front is fine there).

**Decode time, same trace:**

| | Decode time (of ~3.5s render) |
|---|---|
| Before | 900ms |
| After | 200ms |

Clear improvement on the decode axis — but memory still balloons after this change alone.

## Fix 2 — PBO leak patch (`pnpm patch`)

`@allmaps/render@1.0.0-beta.83`'s `WebGL2WarpedMap.updateTextures()` allocates one PBO
(`gl.createBuffer()` for `PIXEL_UNPACK_BUFFER`) per tile per texture rebuild and never deletes it —
the native GPU memory only gets freed when the JS wrapper object is garbage-collected, so usage
balloons until a GC sweep catches up (visible as GC time in the trace). Patched in
`app/patches/@allmaps__render@1.0.0-beta.83.patch`: added `gl.deleteBuffer(pbo)` right after the
buffer is unbound. Removable the moment upstream ships the fix (see `DebugPlan.md` Phase 3).

**Observed:** max memory cap dropped from **2.6GB to 800MB**.

Don't yet fully understand why this had that large an impact on its own — the per-canvas sprite
change (Fix 1) landed first and would explain the decode-time win, but the memory-cap drop is
bigger than expected from "just" no longer decoding the full sheet per batch. Worth re-profiling
with the two changes isolated to confirm how much of the 2.6GB → 800MB drop is actually
attributable to the PBO patch vs. the sprite split (they were measured together, not separately).


## observation ## s
 
Incremental GC remains a very large bottleneck - clearing PBO in the rendering loop improved this in some cases but it did not solve the porblem altogether, pointing at the fact there is mmore manual buffer cleanup to do.

## theory ## 

the reason we only observe this behaviour at higher resolution screens is because the buffers scale exponentially with dpi and resolution: at lower res GC can handle cleaning just fine, at higher res it becomes a problem. 

## Trace reading note

In the profiler, the green spikes are decode work — both the sprite-sheet decode (Fix 1's target)
and, after the PBO patch, whatever decode/GC activity remains around the `gl.deleteBuffer(pbo)`
call site.

## Open follow-ups

- Isolate and re-measure Fix 1 vs Fix 2 individually to attribute the memory-cap drop correctly.
- Try the Allmaps advanced tuning knobs (developer menu) for further memory reduction, per the
  original memory-bottleneck note.
- Continue isolating texture-array retention, shrinking and in-viewport overdraw. The vertex-buffer
  and texture-array experiments below were both rejected after profiling; only the PBO patch remains
  active.

## Fix 3 — superseded-render cleanup

Starting a replacement render for the same IIIF sublayer now runs the previous session's cleanup
callbacks first, preventing stale listeners, diagnostics and map layers from remaining active.

## Rejected experiment 1 — persistent vertex buffers (`pnpm patch`)

Allmaps created a new `WebGLBuffer` for every map, line and point attribute on each
`updateVertexBuffers*()` call and left the replaced buffer to garbage collection. The patch makes
each `WebGL2WarpedMap` own one lazily-created buffer per attribute, reuses it with `bufferData()`,
and explicitly deletes all owned buffers in `destroy()`. Context restoration resets the ownership
maps so invalid buffers from the lost context are never reused.

**Decision: rejected.** Although the patch reduced JS/native buffer replacement and GC churn, the
measured GPU workload increased and the high-zoom freeze did not improve. Reusing the buffers was
therefore not a worthwhile tradeoff for the observed increase in GPU load. The vertex changes have
been removed from the active branch.

## Rejected experiment 2 — texture-array shrinking and offscreen release (`pnpm patch`)

The texture experiment implemented the previously empty `clearTextures()`, tracked allocated
texture-array depth, rebuilt strict-subset tile sets at a smaller depth after a 500ms debounce, and
released textures once a canvas left the buffered prune viewport. This successfully bounded
resident texture memory during high-zoom panning: diagnostics showed only 6–17 resident maps and
roughly 24–53MB of texture arrays even while 186 canvases remained loaded, with `shrinkLag=0`.

**Decision: rejected.** Allmaps resizes an array with a complete `texImage3D()` allocation and
reuploads every retained tile. Continually removing or shrinking arrays therefore traded retained
memory for upload churn and visible stalls. Representative diagnostic windows included 17 complete
rebuilds / 70MB uploaded with a 410ms worst frame, 16 rebuilds / 87MB with a 430ms frame, and 12
rebuilds / 97MB with a 520ms frame. Zooming out was especially costly because many canvases became
resident together: one window performed 283 rebuilds and uploaded 365MB. The memory reduction did
not justify the reallocation cost or flicker risk.

The full texture-array experiment, including the vertex-buffer variant it was tested with, is kept
on branch `experiment/allmaps-texture-arrays` at commit `367d521` for reference. It is not active on
`ref/viewerV2`.

## Active local Allmaps patch

Only the one-line PBO fix remains active in
`app/patches/@allmaps__render@1.0.0-beta.83.patch`:

```js
gl.deleteBuffer(pbo);
```

The vertex-buffer and texture-array lifecycle patches are not part of the active branch.
