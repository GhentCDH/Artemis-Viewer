import type { WarpedMapLayer } from '@allmaps/maplibre';
import type maplibregl from 'maplibre-gl';

/**
 * Lightweight tile-cache logger behind the "Allmaps tile cache log" developer toggle —
 * independent of the heavier performance-diagnostics module so the cache can be watched
 * without GL instrumentation or frame-pacing overhead.
 *
 * Reads `layer.renderer.tileCache` (the path verified in iiifAllmapsDiagnostics against
 * @allmaps/render beta.83) and reports, per interval:
 * - total tiles held by the shared tile cache and their decoded byte footprint,
 *   broken down by tile dimensions,
 * - how many of those belong to maps currently in the viewport (`renderer.mapsInViewport`).
 *   Note this means "held by in-viewport maps": individual tiles can sit just outside the
 *   visible edge, and the remainder is the pan-back retention buffer (pruneViewportBufferRatio
 *   plus the renderer's own eviction margin), not a leak.
 * - the in-flight fetch count.
 *
 * `window.__allmapsTileCacheTable()` dumps every cached tile (url, dimensions, bytes) as a
 * console.table for the attached layer(s).
 */
const LOG_INTERVAL_MS = 1000;

/** Decoded tile as held by Allmaps' tile cache (ImageData in the worker-decode pipeline). */
interface CachedTileInternals {
  tileUrl?: string;
  data?: { width?: number; height?: number; data?: { byteLength?: number } };
}

interface TileCacheLogInternals {
  // Probed defensively — these are library internals, not public API.
  getCachedTiles?: () => CachedTileInternals[];
  getMapCachedTiles?: (mapId: string) => unknown[];
  tilesFetchingCount?: number;
}

interface RendererLogInternals {
  mapsInViewport?: Set<string>;
  tileCache?: TileCacheLogInternals;
}

/** Bytes held by a decoded tile; falls back to width×height×RGBA when the buffer is absent. */
function tileBytes(tile: CachedTileInternals): number {
  const bufferBytes = tile.data?.data?.byteLength ?? 0;
  if (bufferBytes > 0) return bufferBytes;
  const width = tile.data?.width ?? 0;
  const height = tile.data?.height ?? 0;
  return width > 0 && height > 0 ? width * height * 4 : 0;
}

const mb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

/** e.g. "256x256×180 (45.0MB), 512x512×60 (60.0MB)" — descending by total bytes. */
function sizeBreakdown(tiles: CachedTileInternals[]): string {
  const groups = new Map<string, { count: number; bytes: number }>();
  for (const tile of tiles) {
    const key = `${tile.data?.width ?? '?'}x${tile.data?.height ?? '?'}`;
    const group = groups.get(key) ?? { count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += tileBytes(tile);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .map(([size, group]) => `${size}×${group.count} (${mb(group.bytes)})`)
    .join(', ');
}

// On-demand per-tile dumps for every attached layer, so the periodic line can stay compact.
const tableDumpers = new Map<string, () => void>();

function installGlobalTableDump(): void {
  (window as unknown as { __allmapsTileCacheTable?: (label?: string) => void }).__allmapsTileCacheTable = (label?: string) => {
    for (const [dumperLabel, dump] of tableDumpers) {
      if (!label || dumperLabel.includes(label)) dump();
    }
    if (tableDumpers.size === 0) console.log('[allmaps-tilecache] no layers attached');
  };
}

export function attachAllmapsTileCacheLog(args: { label: string; map: maplibregl.Map; layer: WarpedMapLayer; enabled: boolean }): () => void {
  if (!args.enabled) return () => {};
  const { label, map, layer } = args;

  let detached = false;
  let renderer: RendererLogInternals | null = null;

  // `layer.renderer` is only set once maplibre calls onAdd; poll briefly until it exists.
  const attachPoll = setInterval(() => {
    const candidate = (layer as unknown as { renderer?: RendererLogInternals }).renderer;
    if (!candidate?.tileCache) return;
    clearInterval(attachPoll);
    if (detached) return;
    renderer = candidate;
    console.log(
      `[allmaps-tilecache ${label}] attached to renderer tile cache — call window.__allmapsTileCacheTable() to dump all cached tiles`,
    );
  }, 250);

  installGlobalTableDump();
  tableDumpers.set(label, () => {
    const tiles = renderer?.tileCache?.getCachedTiles?.() ?? [];
    let totalBytes = 0;
    const rows = tiles.map((tile) => {
      const bytes = tileBytes(tile);
      totalBytes += bytes;
      return {
        url: tile.tileUrl ?? '?',
        width: tile.data?.width ?? -1,
        height: tile.data?.height ?? -1,
        kb: Math.round(bytes / 1024),
      };
    });
    console.log(`[allmaps-tilecache ${label}] ${rows.length} cached tiles, ${mb(totalBytes)} decoded`);
    console.table(rows);
  });

  let lastLine = '';
  const logTimer = setInterval(() => {
    const tileCache = renderer?.tileCache;
    if (!tileCache) return;

    let cachedTiles: CachedTileInternals[] = [];
    let viewportMaps = -1;
    let viewportTiles = -1;
    try {
      cachedTiles = tileCache.getCachedTiles?.() ?? [];
      const mapsInViewport = renderer?.mapsInViewport;
      if (mapsInViewport && tileCache.getMapCachedTiles) {
        viewportMaps = mapsInViewport.size;
        viewportTiles = 0;
        for (const mapId of mapsInViewport) viewportTiles += tileCache.getMapCachedTiles(mapId).length;
      }
    } catch {
      // Logging must never interfere with rendering.
      return;
    }

    let totalBytes = 0;
    for (const tile of cachedTiles) totalBytes += tileBytes(tile);
    const line =
      `cache=${cachedTiles.length} tiles (${mb(totalBytes)}) | viewport: ${viewportMaps} maps holding ${viewportTiles} tiles | ` +
      `fetching=${tileCache.tilesFetchingCount ?? 0}` +
      (cachedTiles.length > 0 ? ` | sizes: ${sizeBreakdown(cachedTiles)}` : '');
    // Only log on change so an idle map doesn't flood the console.
    if (line === lastLine) return;
    lastLine = line;
    console.log(`[allmaps-tilecache ${label}] z=${map.getZoom().toFixed(2)} | ${line}`);
  }, LOG_INTERVAL_MS);

  return () => {
    detached = true;
    clearInterval(attachPoll);
    clearInterval(logTimer);
    tableDumpers.delete(label);
  };
}
