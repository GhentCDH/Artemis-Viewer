import type { WarpedMapLayer } from '@allmaps/maplibre';
import type maplibregl from 'maplibre-gl';

/**
 * TEMPORARY diagnostics for the high-zoom pan-lag investigation (2026-07). Confirms/refutes the
 * fill-rate hypothesis: past the zoom where the sprite atlas stops covering the needed resolution,
 * full-res IIIF tiles accumulate in each map's texture array, and the fragment shader's per-pixel
 * linear scan over that array blows the GPU frame budget (cost ∝ canvas pixels × cached tiles ×
 * overlapping maps). If confirmed, reports around the lag threshold will show `real` tile counts
 * and `tiles max/map` climbing while jank frames spike — and the same numbers with a smaller
 * window should show similar tile counts but no jank. Delete this module once resolved.
 */
const REPORT_INTERVAL_MS = 2000;
// rAF gaps above this count as a janky frame (~2 missed 60Hz frames).
const JANK_FRAME_MS = 33;

interface TileCacheInternals extends EventTarget {
  getMapCachedTiles(mapId: string): unknown[];
}

/** Structural view of @allmaps/render's WebGL2Renderer (transitive dep — not imported directly). */
interface RendererInternals {
  mapsWithFetchableTilesForViewport?: Set<string>;
  mapsInViewport?: Set<string>;
  // Tile events fire on these caches, not on the renderer itself: real-tile loads and fetch
  // errors on `tileCache`, sprite-atlas loads on `spritesTileCache`.
  tileCache?: TileCacheInternals;
  spritesTileCache?: TileCacheInternals;
}

export function attachAllmapsDiagnostics(args: {
  label: string;
  map: maplibregl.Map;
  layer: WarpedMapLayer;
  getLoadedCount: () => number;
  enabled: boolean;
}): () => void {
  if (!args.enabled) return () => {};
  const { label, map, layer, getLoadedCount } = args;

  let detached = false;
  let renderer: RendererInternals | null = null;

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
    console.log(`[allmaps-diag ${label}] attached to renderer (spritesTileCache=${Boolean(renderer.spritesTileCache)})`);
  }, 250);

  // Frame pacing: long rAF gaps mean the main thread or the WebGL command queue (GPU
  // backpressure) blocked — captures fill-bound jank as well as scripting jank.
  let frames = 0;
  let jankFrames = 0;
  let worstFrameMs = 0;
  let lastFrameAt = performance.now();
  let rafId = requestAnimationFrame(function tick(now: number) {
    const delta = now - lastFrameAt;
    lastFrameAt = now;
    frames += 1;
    if (delta > JANK_FRAME_MS) {
      jankFrames += 1;
      if (delta > worstFrameMs) worstFrameMs = delta;
    }
    if (!detached) rafId = requestAnimationFrame(tick);
  });

  const reportTimer = setInterval(() => {
    if (!dirty && jankFrames === 0) {
      frames = 0;
      return;
    }

    const renderSet = renderer?.mapsWithFetchableTilesForViewport;
    const inViewport = renderer?.mapsInViewport?.size ?? -1;
    let maxTilesPerMap = 0;
    let totalCachedTiles = 0;
    if (renderer?.tileCache && renderSet) {
      for (const mapId of renderSet) {
        const count = renderer.tileCache.getMapCachedTiles(mapId).length;
        totalCachedTiles += count;
        if (count > maxTilesPerMap) maxTilesPerMap = count;
      }
    }

    const canvas = map.getCanvas();
    console.log(
      `[allmaps-diag ${label}] zoom=${map.getZoom().toFixed(2)} | ` +
        `canvas=${canvas.width}x${canvas.height} (dpr=${window.devicePixelRatio}) | ` +
        `loaded=${getLoadedCount()} drawnPerFrame=${renderSet?.size ?? -1} inViewport=${inViewport} | ` +
        `tiles max/map=${maxTilesPerMap} total=${totalCachedTiles} | ` +
        `window: +${realTiles} real, +${spriteTiles} sprite, +${fetchErrors} errors | ` +
        `frames=${frames} jank(>${JANK_FRAME_MS}ms)=${jankFrames} worst=${worstFrameMs.toFixed(0)}ms`,
    );

    realTiles = 0;
    spriteTiles = 0;
    fetchErrors = 0;
    dirty = false;
    frames = 0;
    jankFrames = 0;
    worstFrameMs = 0;
  }, REPORT_INTERVAL_MS);

  return () => {
    detached = true;
    clearInterval(attachPoll);
    clearInterval(reportTimer);
    cancelAnimationFrame(rafId);
    if (renderer) {
      renderer.tileCache?.removeEventListener('maptileloaded', onRealTile);
      renderer.tileCache?.removeEventListener('tilefetcherror', onFetchError);
      renderer.spritesTileCache?.removeEventListener('maptilesloadedfromsprites', onSpriteTiles);
    }
  };
}
