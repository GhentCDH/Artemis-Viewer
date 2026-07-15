import type { WarpedMapLayer } from '@allmaps/maplibre';
import type maplibregl from 'maplibre-gl';

/**
 * TEMPORARY diagnostics for the high-zoom progressive-freeze investigation (2026-07, see
 * DebugPlan.md). Measures the two suspected axes directly so Phase 0 can confirm/refute them
 * from the console alone:
 *
 * Axis 1 — in-viewport overdraw × per-pixel tile scan. Allmaps' map fragment shader linearly
 * scans a map's entire cached-tile texture array per pixel, and every map in
 * `mapsWithFetchableTilesForViewport` is drawn back-to-front with no occlusion culling. The
 * `render` line therefore reports, per drawn map, the *texture depth actually scanned*
 * (`cachedTilesForTexture.length` — not the tile-cache count, which can differ because texture
 * arrays never shrink) times its projected on-screen device-pixel coverage:
 *   scan ≈ Σ over drawn maps (covered device px × texture depth)   [texel scans / frame]
 * If jank onset tracks `scan` (and the worst-frame snapshot shows high drawn/Σdepth), Axis 1
 * is confirmed.
 *
 * Axis 2 — GPU resource retention. The installed @allmaps/render leaks one PBO per tile per
 * texture rebuild and orphans vertex buffers, and resident maps keep their full texture arrays
 * until destroyed. The `gpu` line instruments the shared WebGL2 context (createBuffer /
 * bufferData / deleteBuffer / texImage3D, plus a FinalizationRegistry so buffers freed by GC of
 * their JS wrapper are credited back) and sums texture VRAM over *all* resident warped maps.
 * Live buffer bytes climbing while `tiles` stays stable, `gc` lagging `Δ created`, and `tex`
 * staircasing as new areas are visited are the Axis 2 signatures — no Task Manager needed
 * (it remains useful as an external cross-check).
 *
 * Watchdog — slow structural sampler. Every WATCHDOG_INTERVAL_MS it snapshots what the fast
 * lines can't see: CPU-side decoded-tile bytes held by Allmaps' tile caches, the fetch/prune
 * queues, the app-side canvas queue, JS heap, and texture residency with its lifetime peak.
 * It escalates to console.warn when retained tile data crosses WATCHDOG_TILE_BYTES_WARN or when
 * fetching/draining keeps running past WATCHDOG_BACKGROUND_WORK_WARN_MS in a hidden tab.
 *
 * The latest report is also mirrored to `window.__allmapsDiag[label]` for programmatic
 * comparison between knob-test runs. Delete this module once DebugPlan Phase 4 acceptance
 * passes.
 */
const REPORT_INTERVAL_MS = 2000;
// rAF gaps above this count as a janky frame (~2 missed 60Hz frames).
const JANK_FRAME_MS = 33;
const WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_BACKGROUND_WORK_WARN_MS = 15000;
const WATCHDOG_TILE_BYTES_WARN = 512 * 1024 * 1024;

/** Decoded tile as held by Allmaps' tile caches (ImageData in the worker-decode pipeline). */
interface CacheableTileInternals {
  data?: { width?: number; height?: number; data?: { byteLength?: number } };
}

interface TileCacheInternals extends EventTarget {
  getMapCachedTiles(mapId: string): unknown[];
  // Verified against @allmaps/render beta.83 TileCache; probed defensively anyway.
  getCachedTiles?: () => CacheableTileInternals[];
  tilesFetchingCount?: number;
  tileRemoveQueue?: unknown[];
}

/** Structural view of @allmaps/render's WebGL2WarpedMap (fields verified against beta.83). */
interface WarpedMapInternals {
  mapId: string;
  geoMaskBbox?: [number, number, number, number];
  tileSize?: [number, number];
  cachedTilesForTexture?: unknown[];
}

interface WarpedMapListInternals {
  getWarpedMaps(): WarpedMapInternals[];
  getWarpedMap(mapId: string): WarpedMapInternals | undefined;
}

/** Structural view of @allmaps/render's WebGL2Renderer (transitive dep — not imported directly). */
interface RendererInternals {
  gl?: WebGL2RenderingContext;
  mapsWithFetchableTilesForViewport?: Set<string>;
  mapsInViewport?: Set<string>;
  warpedMapList?: WarpedMapListInternals;
  // Tile events fire on these caches, not on the renderer itself: real-tile loads and fetch
  // errors on `tileCache`, sprite-atlas loads on `spritesTileCache`.
  tileCache?: TileCacheInternals;
  spritesTileCache?: TileCacheInternals;
}

// ---------------------------------------------------------------------------------------------
// WebGL context instrumentation (Axis 2). Wrapped once per context and refcounted because the
// context is shared: multiple sublayers can attach diagnostics, and maplibre itself allocates on
// the same context (its buffers are well-behaved create/delete pairs, so a monotonic climb in the
// live gauges is attributable to Allmaps; PBO figures are Allmaps-only since nothing else binds
// PIXEL_UNPACK_BUFFER).
// ---------------------------------------------------------------------------------------------

/** Byte holder shared between the live WeakMap and the FinalizationRegistry (never retains the buffer). */
interface BufferHolder {
  bytes: number;
  isPbo: boolean;
  freed: boolean;
}

export interface GlCounters {
  // Live gauges.
  liveBuffers: number;
  liveBufferBytes: number;
  livePboBuffers: number;
  livePboBytes: number;
  // Cumulative (instances diff these per report window).
  created: number;
  deleted: number;
  gcFreed: number;
  gcFreedBytes: number;
  uploadedBytes: number;
  pboUploadedBytes: number;
  texArrayReallocs: number;
  texArrayReallocBytes: number;
}

export interface GlInstrumentation {
  counters: GlCounters;
  refs: number;
  restore: () => void;
}

const glInstrumentations = new WeakMap<WebGL2RenderingContext, GlInstrumentation>();

// Exported for the standalone PBO-log toggle (iiifAllmapsGpuLogs) — refcounting makes
// concurrent use with the full diagnostics toggle safe.
export function instrumentGl(gl: WebGL2RenderingContext): GlInstrumentation {
  const existing = glInstrumentations.get(gl);
  if (existing) {
    existing.refs += 1;
    return existing;
  }

  const counters: GlCounters = {
    liveBuffers: 0,
    liveBufferBytes: 0,
    livePboBuffers: 0,
    livePboBytes: 0,
    created: 0,
    deleted: 0,
    gcFreed: 0,
    gcFreedBytes: 0,
    uploadedBytes: 0,
    pboUploadedBytes: 0,
    texArrayReallocs: 0,
    texArrayReallocBytes: 0,
  };

  const holders = new WeakMap<WebGLBuffer, BufferHolder>();
  const boundByTarget = new Map<number, WebGLBuffer | null>();

  function release(holder: BufferHolder, viaGc: boolean): void {
    if (holder.freed) return;
    holder.freed = true;
    counters.liveBuffers -= 1;
    counters.liveBufferBytes -= holder.bytes;
    if (holder.isPbo) {
      counters.livePboBuffers -= 1;
      counters.livePboBytes -= holder.bytes;
    }
    if (viaGc) {
      counters.gcFreed += 1;
      counters.gcFreedBytes += holder.bytes;
    }
  }

  // Browsers free the underlying GL buffer when its JS wrapper is collected without an explicit
  // deleteBuffer — the diagnosed leak "balloons ahead of collection" rather than growing forever.
  // The registry credits those back so the live gauges track actual GPU residency, and `gcFreed`
  // itself quantifies how far allocation outruns collection.
  const registry = new FinalizationRegistry<BufferHolder>((holder) => release(holder, true));

  const original = {
    createBuffer: gl.createBuffer,
    deleteBuffer: gl.deleteBuffer,
    bindBuffer: gl.bindBuffer,
    bufferData: gl.bufferData,
    texImage3D: gl.texImage3D,
  };

  gl.createBuffer = function (this: WebGL2RenderingContext): WebGLBuffer {
    const buffer = original.createBuffer.call(this);
    if (buffer) {
      const holder: BufferHolder = { bytes: 0, isPbo: false, freed: false };
      holders.set(buffer, holder);
      registry.register(buffer, holder);
      counters.created += 1;
      counters.liveBuffers += 1;
    }
    return buffer;
  };

  gl.deleteBuffer = function (this: WebGL2RenderingContext, buffer: WebGLBuffer | null): void {
    if (buffer) {
      const holder = holders.get(buffer);
      if (holder && !holder.freed) {
        counters.deleted += 1;
        release(holder, false);
      }
    }
    original.deleteBuffer.call(this, buffer);
  };

  gl.bindBuffer = function (this: WebGL2RenderingContext, target: number, buffer: WebGLBuffer | null): void {
    boundByTarget.set(target, buffer);
    original.bindBuffer.call(this, target, buffer);
  };

  gl.bufferData = function (this: WebGL2RenderingContext, target: number, ...rest: unknown[]): void {
    const sizeOrData = rest[0];
    let bytes = 0;
    if (typeof sizeOrData === 'number') bytes = sizeOrData;
    else if (ArrayBuffer.isView(sizeOrData)) bytes = sizeOrData.byteLength;
    else if (sizeOrData instanceof ArrayBuffer) bytes = sizeOrData.byteLength;

    const bound = boundByTarget.get(target);
    const holder = bound ? holders.get(bound) : undefined;
    if (holder && !holder.freed) {
      counters.liveBufferBytes += bytes - holder.bytes;
      if (target === this.PIXEL_UNPACK_BUFFER && !holder.isPbo) {
        holder.isPbo = true;
        counters.livePboBuffers += 1;
        counters.livePboBytes += holder.bytes;
      }
      if (holder.isPbo) counters.livePboBytes += bytes - holder.bytes;
      holder.bytes = bytes;
    }
    counters.uploadedBytes += bytes;
    if (target === this.PIXEL_UNPACK_BUFFER) counters.pboUploadedBytes += bytes;
    (original.bufferData as (this: WebGL2RenderingContext, ...a: unknown[]) => void).call(this, target, ...rest);
  } as typeof gl.bufferData;

  gl.texImage3D = function (this: WebGL2RenderingContext, ...args: unknown[]): void {
    // Allmaps' full texture-array reallocation: texImage3D(TEXTURE_2D_ARRAY, 0, RGBA, w, h, depth,
    // 0, RGBA, UNSIGNED_BYTE, null) — each one implies a complete re-upload of every cached tile.
    const [target, , , width, height, depth] = args as number[];
    if (target === this.TEXTURE_2D_ARRAY) {
      counters.texArrayReallocs += 1;
      counters.texArrayReallocBytes += width * height * depth * 4;
    }
    (original.texImage3D as (this: WebGL2RenderingContext, ...a: unknown[]) => void).call(this, ...args);
  } as typeof gl.texImage3D;

  const instrumentation: GlInstrumentation = {
    counters,
    refs: 1,
    restore: () => {
      gl.createBuffer = original.createBuffer;
      gl.deleteBuffer = original.deleteBuffer;
      gl.bindBuffer = original.bindBuffer;
      gl.bufferData = original.bufferData;
      gl.texImage3D = original.texImage3D;
      glInstrumentations.delete(gl);
    },
  };
  glInstrumentations.set(gl, instrumentation);
  return instrumentation;
}

export function releaseGlInstrumentation(gl: WebGL2RenderingContext): void {
  const instrumentation = glInstrumentations.get(gl);
  if (!instrumentation) return;
  instrumentation.refs -= 1;
  if (instrumentation.refs <= 0) instrumentation.restore();
}

// ---------------------------------------------------------------------------------------------

const mb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(0)}MB`;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 1)}${units[unit]}`;
}

/** Bytes held by a decoded tile; falls back to width×height×RGBA when the buffer is absent. */
function tileDataBytes(tile: CacheableTileInternals): number {
  const bufferBytes = tile.data?.data?.byteLength ?? 0;
  if (bufferBytes > 0) return bufferBytes;
  const width = tile.data?.width ?? 0;
  const height = tile.data?.height ?? 0;
  return width > 0 && height > 0 ? width * height * 4 : 0;
}

function cachedTileFootprint(cache: TileCacheInternals | undefined): { count: number; bytes: number } {
  try {
    const tiles = cache?.getCachedTiles?.() ?? [];
    let bytes = 0;
    for (const tile of tiles) bytes += tileDataBytes(tile);
    return { count: tiles.length, bytes };
  } catch {
    // Diagnostics must never interfere with rendering.
    return { count: -1, bytes: 0 };
  }
}

function heapUsage(): string {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  if (!memory?.usedJSHeapSize) return 'n/a';
  return `${formatBytes(memory.usedJSHeapSize)} (limit ${formatBytes(memory.jsHeapSizeLimit ?? 0)})`;
}

/** Device pixels of the viewport covered by a geo bbox (bbox of projected corners, rotation-safe overestimate). */
function coveredDevicePixels(map: maplibregl.Map, bbox: [number, number, number, number], cssWidth: number, cssHeight: number, dpr: number): number {
  const corners: [number, number][] = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const point = map.project(corner);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return 0;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  const width = Math.min(maxX, cssWidth) - Math.max(minX, 0);
  const height = Math.min(maxY, cssHeight) - Math.max(minY, 0);
  if (width <= 0 || height <= 0) return 0;
  return width * height * dpr * dpr;
}

export interface AllmapsRuntimeState {
  queued: number;
  adding: number;
  failed: number;
  draining: boolean;
  started: boolean;
  spriteBatches: number;
}

export function attachAllmapsDiagnostics(args: {
  label: string;
  map: maplibregl.Map;
  layer: WarpedMapLayer;
  getLoadedCount: () => number;
  getRuntimeState?: () => AllmapsRuntimeState;
  enabled: boolean;
}): () => void {
  if (!args.enabled) return () => {};
  const { label, map, layer, getLoadedCount, getRuntimeState } = args;

  let detached = false;
  let renderer: RendererInternals | null = null;
  let glInstrumentation: GlInstrumentation | null = null;
  let instrumentedGl: WebGL2RenderingContext | null = null;
  // Cumulative GL counters at the previous report, for per-window deltas.
  let previousGl: GlCounters | null = null;

  // Window counters, reset per report.
  let realTiles = 0;
  let spriteTiles = 0;
  let fetchErrors = 0;
  let dirty = false;

  const onRealTile = () => {
    realTiles += 1;
    dirty = true;
  };
  const onSpriteTiles = () => {
    spriteTiles += 1;
    dirty = true;
  };
  const onFetchError = () => {
    fetchErrors += 1;
    dirty = true;
  };

  // `layer.renderer` is only set once maplibre calls onAdd; poll briefly until it exists.
  const attachPoll = setInterval(() => {
    const candidate = (layer as unknown as { renderer?: RendererInternals }).renderer;
    if (!candidate?.tileCache) return;
    clearInterval(attachPoll);
    if (detached) return;
    renderer = candidate;
    renderer.tileCache?.addEventListener('maptileloaded', onRealTile);
    renderer.tileCache?.addEventListener('tilefetcherror', onFetchError);
    renderer.spritesTileCache?.addEventListener('maptilesloadedfromsprites', onSpriteTiles);
    if (renderer.gl) {
      instrumentedGl = renderer.gl;
      glInstrumentation = instrumentGl(instrumentedGl);
      previousGl = { ...glInstrumentation.counters };
    }
    console.log(
      `[allmaps-diag ${label}] attached to renderer ` +
        `(spritesTileCache=${Boolean(renderer.spritesTileCache)} glInstrumented=${Boolean(glInstrumentation)})`,
    );
  }, 250);

  /** Texture depth actually scanned by the fragment shader — the Axis 1 cost driver. */
  function textureDepth(mapId: string): number {
    return renderer?.warpedMapList?.getWarpedMap(mapId)?.cachedTilesForTexture?.length ?? 0;
  }

  // Frame pacing: long rAF gaps mean the main thread or the WebGL command queue (GPU
  // backpressure) blocked — captures fill-bound jank as well as scripting jank.
  let frames = 0;
  let jankFrames = 0;
  let worstFrameMs = 0;
  // Snapshot at the worst jank frame of the window, to correlate jank with drawn-set state at
  // the moment it happened rather than with end-of-window aggregates.
  let worstFrameDrawn = -1;
  let worstFrameDepthSum = -1;
  let lastFrameAt = performance.now();
  let rafId = requestAnimationFrame(function tick(now: number) {
    const delta = now - lastFrameAt;
    lastFrameAt = now;
    frames += 1;
    if (delta > JANK_FRAME_MS) {
      jankFrames += 1;
      if (delta > worstFrameMs) {
        worstFrameMs = delta;
        const renderSet = renderer?.mapsWithFetchableTilesForViewport;
        if (renderSet) {
          worstFrameDrawn = renderSet.size;
          worstFrameDepthSum = 0;
          for (const mapId of renderSet) worstFrameDepthSum += textureDepth(mapId);
        }
      }
    }
    if (!detached) rafId = requestAnimationFrame(tick);
  });

  const reportTimer = setInterval(() => {
    const gl = glInstrumentation?.counters ?? null;
    const glActivity = gl && previousGl ? gl.created !== previousGl.created || gl.uploadedBytes !== previousGl.uploadedBytes : false;
    if (!dirty && jankFrames === 0 && !glActivity) {
      frames = 0;
      return;
    }

    const canvas = map.getCanvas();
    const dpr = window.devicePixelRatio;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    const viewportPixels = canvas.width * canvas.height;

    // --- Axis 1: drawn maps, scanned depth, projected coverage → estimated per-frame scan cost.
    const renderSet = renderer?.mapsWithFetchableTilesForViewport;
    const inViewport = renderer?.mapsInViewport?.size ?? -1;
    let drawnDepthSum = 0;
    let drawnDepthMax = 0;
    let scanCost = 0; // Σ covered device px × texture depth (each costs ~5 texelFetches in-shader)
    let coveredPixelsSum = 0;
    let topCost = 0;
    let topLine = '';
    if (renderSet) {
      for (const mapId of renderSet) {
        const warpedMap = renderer?.warpedMapList?.getWarpedMap(mapId);
        const depth = warpedMap?.cachedTilesForTexture?.length ?? 0;
        drawnDepthSum += depth;
        if (depth > drawnDepthMax) drawnDepthMax = depth;
        const covered = warpedMap?.geoMaskBbox ? coveredDevicePixels(map, warpedMap.geoMaskBbox, cssWidth, cssHeight, dpr) : 0;
        coveredPixelsSum += covered;
        const cost = covered * depth;
        scanCost += cost;
        if (cost > topCost) {
          topCost = cost;
          topLine = `${mapId.slice(0, 8)} ${(covered / 1e6).toFixed(1)}Mpx×${depth}`;
        }
      }
    }
    const overdraw = viewportPixels > 0 ? coveredPixelsSum / viewportPixels : 0;

    // --- Axis 2: residency across ALL warped maps (texture arrays never shrink or release).
    let residentMaps = 0;
    let residentDepthSum = 0;
    let residentTextureBytes = 0;
    let shrinkLag = 0; // Σ (texture depth − current tile-cache count): depth kept beyond pruning
    for (const warpedMap of renderer?.warpedMapList?.getWarpedMaps() ?? []) {
      const depth = warpedMap.cachedTilesForTexture?.length ?? 0;
      if (depth === 0) continue;
      residentMaps += 1;
      residentDepthSum += depth;
      const [tileWidth, tileHeight] = warpedMap.tileSize ?? [0, 0];
      residentTextureBytes += depth * tileWidth * tileHeight * 4;
      const cached = renderer?.tileCache?.getMapCachedTiles(warpedMap.mapId).length ?? depth;
      if (depth > cached) shrinkLag += depth - cached;
    }

    const runtime = getRuntimeState?.();
    console.log(
      `[allmaps-diag ${label}] render | z=${map.getZoom().toFixed(2)} canvas=${canvas.width}x${canvas.height}@${dpr} | ` +
        `maps: drawn=${renderSet?.size ?? -1} inViewport=${inViewport} resident=${residentMaps} loaded=${getLoadedCount()} | ` +
        (runtime ? `queue: pending=${runtime.queued} adding=${runtime.adding} failed=${runtime.failed} | ` : '') +
        `depth: drawnSum=${drawnDepthSum} max=${drawnDepthMax} residentSum=${residentDepthSum} shrinkLag=${shrinkLag} | ` +
        `scan=${(scanCost / 1e9).toFixed(2)}G/frame overdraw=${overdraw.toFixed(1)}x` +
        (topLine ? ` | heaviest: ${topLine}` : ''),
    );
    if (gl && previousGl) {
      console.log(
        `[allmaps-diag ${label}] gpu    | textures=${mb(residentTextureBytes)} across ${residentMaps} maps | ` +
          `buffers: live=${gl.liveBuffers} (${mb(gl.liveBufferBytes)}) pbo=${gl.livePboBuffers} (${mb(gl.livePboBytes)}) ` +
          `created+${gl.created - previousGl.created} deleted-${gl.deleted - previousGl.deleted} gc=${gl.gcFreed - previousGl.gcFreed} | ` +
          `uploads: pbo=${mb(gl.pboUploadedBytes - previousGl.pboUploadedBytes)} ` +
          `texRealloc=${gl.texArrayReallocs - previousGl.texArrayReallocs} (${mb(gl.texArrayReallocBytes - previousGl.texArrayReallocBytes)}) | ` +
          `tiles: real+${realTiles} sprite+${spriteTiles} errors=${fetchErrors} | ` +
          `frames: ${frames} jank=${jankFrames} worst=${worstFrameMs.toFixed(0)}ms` +
          (worstFrameDrawn >= 0 ? ` (drawn=${worstFrameDrawn} depthSum=${worstFrameDepthSum})` : ''),
      );
    }

    // Mirror for programmatic comparison between knob-test runs (e.g. log2ScaleFactorCorrection).
    // Merged, not replaced: the watchdog sampler stores its own snapshot under the same label.
    const globalDiag = (window as unknown as { __allmapsDiag?: Record<string, Record<string, unknown>> }).__allmapsDiag ?? {};
    (window as unknown as { __allmapsDiag: Record<string, Record<string, unknown>> }).__allmapsDiag = globalDiag;
    globalDiag[label] = {
      ...globalDiag[label],
      at: Date.now(),
      zoom: map.getZoom(),
      drawn: renderSet?.size ?? -1,
      inViewport,
      residentMaps,
      loaded: getLoadedCount(),
      drawnDepthSum,
      drawnDepthMax,
      residentDepthSum,
      shrinkLag,
      scanCost,
      overdraw,
      residentTextureBytes,
      gl: gl ? { ...gl } : null,
      window: { realTiles, spriteTiles, fetchErrors, frames, jankFrames, worstFrameMs, worstFrameDrawn, worstFrameDepthSum },
    };

    if (gl) previousGl = { ...gl };
    realTiles = 0;
    spriteTiles = 0;
    fetchErrors = 0;
    dirty = false;
    frames = 0;
    jankFrames = 0;
    worstFrameMs = 0;
    worstFrameDrawn = -1;
    worstFrameDepthSum = -1;
  }, REPORT_INTERVAL_MS);

  // --- Watchdog: slow structural sampler (see module doc). Sampled rather than event-driven, so
  // sub-interval peaks can slip between snapshots; the lifetime texture peak below compensates
  // for the metric where that matters most.
  let textureBytesPeak = 0;
  let backgroundWorkStartedAt: number | null = null;
  const watchdogTimer = setInterval(() => {
    const runtime = getRuntimeState?.();
    const renderSet = renderer?.mapsWithFetchableTilesForViewport;
    const inViewport = renderer?.mapsInViewport?.size ?? -1;
    const tileCache = cachedTileFootprint(renderer?.tileCache);
    const spriteCache = cachedTileFootprint(renderer?.spritesTileCache);
    const fetching = renderer?.tileCache?.tilesFetchingCount ?? 0;
    const removeQueue = renderer?.tileCache?.tileRemoveQueue?.length ?? 0;

    let residentMaps = 0;
    let textureBytes = 0;
    let deepestArray = 0;
    let biggestMapBytes = 0;
    for (const warpedMap of renderer?.warpedMapList?.getWarpedMaps() ?? []) {
      const depth = warpedMap.cachedTilesForTexture?.length ?? 0;
      if (depth === 0) continue;
      residentMaps += 1;
      const [tileWidth, tileHeight] = warpedMap.tileSize ?? [0, 0];
      const bytes = depth * tileWidth * tileHeight * 4;
      textureBytes += bytes;
      if (depth > deepestArray) deepestArray = depth;
      if (bytes > biggestMapBytes) biggestMapBytes = bytes;
    }
    if (textureBytes > textureBytesPeak) textureBytesPeak = textureBytes;

    // Work that keeps running in a hidden tab burns battery and can balloon caches unobserved.
    const hidden = typeof document !== 'undefined' && document.hidden;
    const busy = fetching > 0 || (runtime?.queued ?? 0) > 0 || (runtime?.draining ?? false);
    const now = performance.now();
    backgroundWorkStartedAt = hidden && busy ? (backgroundWorkStartedAt ?? now) : null;
    const backgroundWorkMs = backgroundWorkStartedAt === null ? 0 : now - backgroundWorkStartedAt;

    const retainedTileBytes = tileCache.bytes + spriteCache.bytes;
    const warnings: string[] = [];
    if (retainedTileBytes >= WATCHDOG_TILE_BYTES_WARN) {
      warnings.push(`retained tile data ${formatBytes(retainedTileBytes)} >= ${formatBytes(WATCHDOG_TILE_BYTES_WARN)}`);
    }
    if (backgroundWorkMs >= WATCHDOG_BACKGROUND_WORK_WARN_MS) {
      warnings.push(`background work for ${(backgroundWorkMs / 1000).toFixed(0)}s in hidden tab`);
    }

    const yesNo = (value: boolean | undefined) => (value ? 'yes' : 'no');
    const message =
      `[allmaps-watchdog ${label}] z=${map.getZoom().toFixed(2)} hidden=${yesNo(hidden)} moving=${yesNo(map.isMoving())} heap=${heapUsage()}` +
      (warnings.length > 0 ? `\n  WARN:      ${warnings.join('; ')}` : '') +
      (runtime
        ? `\n  lifecycle: loaded=${getLoadedCount()} queued=${runtime.queued} adding=${runtime.adding} failed=${runtime.failed}` +
          ` draining=${yesNo(runtime.draining)} started=${yesNo(runtime.started)} spriteBatches=${runtime.spriteBatches}`
        : `\n  lifecycle: loaded=${getLoadedCount()}`) +
      `\n  maps:      resident=${residentMaps} drawn=${renderSet?.size ?? -1} inViewport=${inViewport}` +
      `\n  tileCache: ${tileCache.count} tiles = ${formatBytes(tileCache.bytes)} | fetching=${fetching} removeQueue=${removeQueue}` +
      `\n  sprites:   ${spriteCache.count} tiles = ${formatBytes(spriteCache.bytes)}` +
      `\n  textures:  ${formatBytes(textureBytes)} now / ${formatBytes(textureBytesPeak)} peak | deepest=${deepestArray} tiles biggestMap=${formatBytes(biggestMapBytes)}`;
    if (warnings.length > 0) console.warn(message);
    else console.info(message);

    const globalDiag = (window as unknown as { __allmapsDiag?: Record<string, Record<string, unknown>> }).__allmapsDiag ?? {};
    (window as unknown as { __allmapsDiag: Record<string, Record<string, unknown>> }).__allmapsDiag = globalDiag;
    globalDiag[label] = {
      ...globalDiag[label],
      watchdog: {
        at: Date.now(),
        hidden,
        runtime: runtime ?? null,
        tileCache,
        spriteCache,
        fetching,
        removeQueue,
        textureBytes,
        textureBytesPeak,
        retainedTileBytes,
        backgroundWorkMs,
        warnings,
      },
    };
  }, WATCHDOG_INTERVAL_MS);

  return () => {
    detached = true;
    clearInterval(attachPoll);
    clearInterval(reportTimer);
    clearInterval(watchdogTimer);
    cancelAnimationFrame(rafId);
    if (renderer) {
      renderer.tileCache?.removeEventListener('maptileloaded', onRealTile);
      renderer.tileCache?.removeEventListener('tilefetcherror', onFetchError);
      renderer.spritesTileCache?.removeEventListener('maptilesloadedfromsprites', onSpriteTiles);
    }
    if (instrumentedGl) {
      releaseGlInstrumentation(instrumentedGl);
      instrumentedGl = null;
      glInstrumentation = null;
    }
  };
}
