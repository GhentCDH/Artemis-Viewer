import type { WarpedMapLayer } from '@allmaps/maplibre';
import type maplibregl from 'maplibre-gl';
import { instrumentGl, releaseGlInstrumentation, type GlCounters, type GlInstrumentation } from './iiifAllmapsDiagnostics';

/**
 * GPU-memory loggers behind the "Allmaps GPU texture log" and "Allmaps PBO log" developer
 * toggles. Each isolates one of the memory consumers the 2026-07 investigation measured large
 * (see DebugFindings.md), so they can be watched independently of the full performance
 * diagnostics:
 *
 * - Texture log: per resident warped map, Allmaps keeps a TEXTURE_2D_ARRAY of
 *   depth × tileSize² × 4 bytes — a VRAM mirror of the CPU tile cache that never shrinks when
 *   tiles are pruned (only when the map is destroyed). Structural reads only, zero overhead.
 * - PBO log: @allmaps/render creates one pixel-unpack staging buffer per tile per texture
 *   rebuild; unless the installed version is patched to delete them, they are reclaimed only
 *   when GC collects the JS wrappers (measured ballooning to 836MB). Needs the shared
 *   refcounted GL instrumentation from iiifAllmapsDiagnostics.
 */
const LOG_INTERVAL_MS = 1000;

interface WarpedMapTextureInternals {
  mapId: string;
  tileSize?: [number, number];
  cachedTilesForTexture?: unknown[];
}

interface RendererTextureInternals {
  gl?: WebGL2RenderingContext;
  warpedMapList?: { getWarpedMaps(): WarpedMapTextureInternals[] };
  tileCache?: { getMapCachedTiles?: (mapId: string) => unknown[] };
}

const mb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

/** Polls `layer.renderer` (only set once maplibre calls onAdd) then hands it to `attach`. */
function pollRenderer(layer: WarpedMapLayer, isDetached: () => boolean, attach: (renderer: RendererTextureInternals) => void): () => void {
  const attachPoll = setInterval(() => {
    const candidate = (layer as unknown as { renderer?: RendererTextureInternals }).renderer;
    if (!candidate?.warpedMapList) return;
    clearInterval(attachPoll);
    if (!isDetached()) attach(candidate);
  }, 250);
  return () => clearInterval(attachPoll);
}

export function attachAllmapsTextureLog(args: { label: string; map: maplibregl.Map; layer: WarpedMapLayer; enabled: boolean }): () => void {
  if (!args.enabled) return () => {};
  const { label, map, layer } = args;

  let detached = false;
  let renderer: RendererTextureInternals | null = null;
  const stopPoll = pollRenderer(layer, () => detached, (candidate) => {
    renderer = candidate;
    console.log(`[allmaps-texture ${label}] attached to renderer`);
  });

  let peakBytes = 0;
  let lastLine = '';
  const logTimer = setInterval(() => {
    if (!renderer) return;

    let residentMaps = 0;
    let textureBytes = 0;
    let deepestArray = 0;
    let biggestMapBytes = 0;
    // Texture slots kept beyond the map's current tile-cache count — depth the array retains
    // for tiles that pruning already dropped (arrays never shrink).
    let shrinkLagSlots = 0;
    let shrinkLagBytes = 0;
    try {
      for (const warpedMap of renderer.warpedMapList?.getWarpedMaps() ?? []) {
        const depth = warpedMap.cachedTilesForTexture?.length ?? 0;
        if (depth === 0) continue;
        residentMaps += 1;
        const [tileWidth, tileHeight] = warpedMap.tileSize ?? [0, 0];
        const bytes = depth * tileWidth * tileHeight * 4;
        textureBytes += bytes;
        if (depth > deepestArray) deepestArray = depth;
        if (bytes > biggestMapBytes) biggestMapBytes = bytes;
        const cached = renderer.tileCache?.getMapCachedTiles?.(warpedMap.mapId).length ?? depth;
        if (depth > cached) {
          shrinkLagSlots += depth - cached;
          shrinkLagBytes += (depth - cached) * tileWidth * tileHeight * 4;
        }
      }
    } catch {
      // Logging must never interfere with rendering.
      return;
    }
    if (textureBytes > peakBytes) peakBytes = textureBytes;

    const line =
      `textures=${mb(textureBytes)} across ${residentMaps} maps (peak ${mb(peakBytes)}) | ` +
      `deepest=${deepestArray} tiles biggestMap=${mb(biggestMapBytes)} | ` +
      `shrinkLag=${shrinkLagSlots} slots (${mb(shrinkLagBytes)})`;
    // Only log on change so an idle map doesn't flood the console.
    if (line === lastLine) return;
    lastLine = line;
    console.log(`[allmaps-texture ${label}] z=${map.getZoom().toFixed(2)} | ${line}`);
  }, LOG_INTERVAL_MS);

  return () => {
    detached = true;
    stopPoll();
    clearInterval(logTimer);
  };
}

export function attachAllmapsPboLog(args: { label: string; map: maplibregl.Map; layer: WarpedMapLayer; enabled: boolean }): () => void {
  if (!args.enabled) return () => {};
  const { label, map, layer } = args;

  let detached = false;
  let instrumentedGl: WebGL2RenderingContext | null = null;
  let instrumentation: GlInstrumentation | null = null;
  // Cumulative counters at the previous report, for per-window deltas.
  let previous: GlCounters | null = null;
  let peakPboBytes = 0;

  const stopPoll = pollRenderer(layer, () => detached, (renderer) => {
    if (!renderer.gl) {
      console.warn(`[allmaps-pbo ${label}] renderer has no gl context — PBO logging unavailable`);
      return;
    }
    instrumentedGl = renderer.gl;
    instrumentation = instrumentGl(instrumentedGl);
    previous = { ...instrumentation.counters };
    console.log(
      `[allmaps-pbo ${label}] attached — instrumenting WebGL buffer calls ` +
        `(only allocations from now on are tracked; PBO figures are Allmaps-only)`,
    );
  });

  const logTimer = setInterval(() => {
    const counters = instrumentation?.counters;
    if (!counters || !previous) return;
    if (counters.livePboBytes > peakPboBytes) peakPboBytes = counters.livePboBytes;

    // Only log when something happened: an allocation/free or a change in live residency.
    const active =
      counters.created !== previous.created ||
      counters.deleted !== previous.deleted ||
      counters.gcFreed !== previous.gcFreed ||
      counters.livePboBytes !== previous.livePboBytes;
    if (!active) return;

    console.log(
      `[allmaps-pbo ${label}] z=${map.getZoom().toFixed(2)} | ` +
        `live: ${counters.livePboBuffers} PBOs (${mb(counters.livePboBytes)}, peak ${mb(peakPboBytes)}) ` +
        `allBuffers=${counters.liveBuffers} (${mb(counters.liveBufferBytes)}) | ` +
        `window: created+${counters.created - previous.created} deleted-${counters.deleted - previous.deleted} ` +
        `gcFreed=${counters.gcFreed - previous.gcFreed} (${mb(counters.gcFreedBytes - previous.gcFreedBytes)}) | ` +
        `uploads: pbo=${mb(counters.pboUploadedBytes - previous.pboUploadedBytes)} ` +
        `texRealloc=${counters.texArrayReallocs - previous.texArrayReallocs} (${mb(counters.texArrayReallocBytes - previous.texArrayReallocBytes)})`,
    );
    previous = { ...counters };
  }, LOG_INTERVAL_MS);

  return () => {
    detached = true;
    stopPoll();
    clearInterval(logTimer);
    if (instrumentedGl) {
      releaseGlInstrumentation(instrumentedGl);
      instrumentedGl = null;
      instrumentation = null;
    }
  };
}
