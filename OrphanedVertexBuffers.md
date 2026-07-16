# Bug report: @allmaps/render orphans vertex attribute buffers on every vertex-buffer update

**Status:** documented, deliberately not fixed (benign — see Impact). Candidate for an upstream
report to Allmaps and/or a future extension of our existing `pnpm patch`.

**Affected version:** `@allmaps/render` 1.0.0-beta.83 (installed via `@allmaps/maplibre`
1.0.0-beta.43, with our PBO-deleteBuffer patch — unrelated to this issue).

**Date observed:** 2026-07-15, during the Allmaps memory-toggle work (PBO log toggle).
Related context: `DebugFindings.md` (the diagnostics module doc already noted
"orphans vertex buffers" in passing; this report pins down the mechanism).

## Symptom

With the "Allmaps PBO log" developer toggle on, the live WebGL buffer count climbs steadily
while panning/zooming at a fixed viewport, with near-zero bytes behind it:

```
allBuffers=67  (0.0MB)
allBuffers=153 (0.1MB)
allBuffers=322 (0.2MB)
allBuffers=595 (0.3MB)   ← ~10 s at fixed z=16.10, gcFreed=0 throughout
```

~600 live buffer objects averaging well under 1 KB each — object churn, not memory growth.

## Mechanism

All references are to the compiled dist of the installed package
(`node_modules/@allmaps/render/dist`, pnpm-patched build):

1. `shared/webgl2.js:29` — the `createBuffer(gl, program, data, size, name)` helper always calls
   `gl.createBuffer()`, uploads the data, wires the attribute pointer, and returns. It never
   receives or deletes a previous buffer.
2. `maps/WebGL2WarpedMap.js` — `updateVertexBuffersMap` (line 285), `updateVertexBuffersLines`
   (line 302), and `updateVertexBuffersPoints` (line 377) each call that helper once per vertex
   attribute (~7 for the map program: triangle points ×3, distortion ×2, index, inside-flag;
   up to ~20 more for lines/points when those render). Every invocation creates a **new
   generation** of buffers and binds them into the existing VAO; the previous generation is
   never `deleteBuffer`'d and nothing retains its JS wrappers.
3. `renderers/WebGL2Renderer.js` — `updateVertexBuffers` runs for maps entering the viewport
   (line 177) and on other events (lines 386, 403), so generations accumulate continuously
   during interaction.
4. `maps/WebGL2WarpedMap.js:222` — `destroy()` deletes only the three VAOs
   (`deleteVertexArray`). Deleting a VAO does **not** free the buffers attached to it, so even
   map destruction never explicitly frees any vertex buffer.

The only reclamation path is the browser freeing the underlying GL buffer when GC collects the
orphaned JS wrapper — lazy and driven by heap pressure (`gcFreed=0` over short windows is
expected; the count does come back down eventually).

## Impact

- **Memory:** negligible. Hundreds of buffers total well under 1 MB (measured 595 ≈ 0.4 MB).
- **Frametime:** not implicated. The stutter correlate is the full texture-array re-upload
  churn in `updateTextures` (PBO uploads == texRealloc bytes in the log), a separate issue.
- **Cost:** wasteful create/GC object churn and (minor) driver handle overhead.

**Decision: do not chase this for performance work.** It pollutes buffer-count metrics in the
PBO log (read `livePboBuffers`/`livePboBytes` for the PBO story, not `allBuffers`), and it is
worth fixing upstream for hygiene, but it is not a lever on the observed jank.

## Suggested fix (upstream / future patch)

Either:

- Reuse buffers: create each attribute buffer once per VAO, keep references on the
  `WebGL2WarpedMap`, and update contents with `bufferData` on subsequent
  `updateVertexBuffers*` calls; or
- Minimal variant: retain references to the current generation and `deleteBuffer` each old
  buffer before creating its replacement.

In both cases `destroy()` should also `deleteBuffer` the retained buffers alongside the
`deleteVertexArray` calls.

## Reproduction

1. Enable the "Allmaps PBO log" developer toggle (branding panel → Developer settings).
2. Pan/zoom within an IIIF layer above the Allmaps trigger zoom.
3. Watch `allBuffers=N` climb while `(…MB)` stays near zero and `livePboBuffers` stays 0.
