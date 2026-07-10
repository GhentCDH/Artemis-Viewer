import { WarpedMapLayer } from '@allmaps/maplibre';
import type { SublayerRenderContext, SublayerRenderTarget } from '../types';
import { loadGeomaps } from './geomapsLoader';
import { attachAllmapsDiagnostics } from './iiifAllmapsDiagnostics';
import type { NormalizedGeomapsCanvas } from './geomapsTypes';
import { buildAllmapsImageInfos } from './iiifImageInfo';
import { iiifLayerId, isCurrentIiifRender, registerIiifCleanup } from './iiifLayerRuntime';
import { loadSpriteAtlas, type IiifSprite, type IiifSpriteAtlas } from './iiifSpriteAtlas';

// Below this zoom the raster preview alone is the renderer — visually equivalent at overview
// zoom, but free of Allmaps' per-canvas triangulation cost.
const ALLMAPS_TRIGGER_ZOOM = 12.5;
// Viewport-driven loading: only canvases whose footprint intersects the viewport, padded by this
// fraction on each side, are triangulated. Quick experiment: dropped from 0.5 (main's value) to
// cut how many canvases a single pan reveal queues — at 0.5 the padded load area is ~4x the
// visible viewport; at 0.15 it's ~1.7x, much closer to what's actually on screen.
const ALLMAPS_VIEWPORT_MARGIN = 0.15;
// Triangulation is a one-time, cached cost per canvas (paid inside `addGeoreferencedMap`, not
// repeated on later frames) — this just caps how many *newly revealed* canvases get that one-time
// cost paid per frame while draining the queue, so a reconcile that reveals a big batch at once
// (e.g. a large pan, or first crossing ALLMAPS_TRIGGER_ZOOM) spreads it across frames instead of
// doing it all synchronously and dropping one.
const RECONCILE_CHUNK = 6;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function bboxIntersects(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function squaredDistance(a: [number, number] | null, to: [number, number]): number {
  if (!a) return Number.POSITIVE_INFINITY;
  const dx = a[0] - to[0];
  const dy = a[1] - to[1];
  return dx * dx + dy * dy;
}

export function canRenderIiifAllmapsWarp(target: SublayerRenderTarget): boolean {
  return Boolean(target.sublayer.artifacts.geomaps);
}

/**
 * Adds the Allmaps `WarpedMapLayer` for a group immediately, then defers actually populating it
 * until the map reaches `ALLMAPS_TRIGGER_ZOOM` — the raster preview underneath is the renderer
 * until then. Once triggered, canvases intersecting the (padded) viewport are triangulated
 * nearest-first in small chunks, and stay loaded across pans.
 */
export async function renderIiifAllmapsWarp(context: SublayerRenderContext, target: SublayerRenderTarget, token: number): Promise<boolean> {
  const geomapsPath = target.sublayer.artifacts.geomaps;
  if (!geomapsPath) return false;

  const layerId = iiifLayerId(context.paneId, target.sublayer.id, 'allmaps-warp');
  // Renderer options tuned for pan-at-high-zoom performance (measured 2026-07, see the
  // iiifAllmapsDiagnostics module). Allmaps' fragment shader linearly scans a map's *entire*
  // cached-tile texture array per pixel, and every loaded tile triggers a repack of that whole
  // array — so per-frame cost is driven by cached tiles per map, and the defaults let that grow
  // huge: tiles were pruned only outside a 17×-linear-viewport region (`pruneViewportBufferRatio`
  // buffers per side: 8 → 17× linear, ~290× area), producing texture arrays 100–180 tiles deep and
  // multi-hundred-ms frames on a Retina fullscreen canvas.
  const layer = new WarpedMapLayer({
    layerId,
    // Fetch tiles at the nearest IIIF scale factor instead of the default half-step finer
    // (log2 correction -0.5 ≈ 2× the tiles for sharpness that barely registers at map scale).
    log2ScaleFactorCorrection: 0,
    // Keep viewport tiles for a 5×-linear-viewport pan-back region instead of 17× (1 measured too
    // aggressive: panning back triggered thousands of refetches).
    pruneViewportBufferRatio: 2,
    // Overview tiles (whole-image low-res fallbacks): request within 5×, keep within 9× linear
    // viewport instead of 17×/33×.
    overviewRequestViewportBufferRatio: 2,
    overviewPruneViewportBufferRatio: 4,
  });
  try {
    context.map.addLayer(layer);
  } catch {
    return false;
  }

  let zoomHandler: (() => void) | null = null;
  let moveEndHandler: (() => void) | null = null;

  registerIiifCleanup(context.paneId, target.sublayer.id, () => {
    if (zoomHandler) {
      context.map.off('zoom', zoomHandler);
      zoomHandler = null;
    }
    if (moveEndHandler) {
      context.map.off('moveend', moveEndHandler);
      moveEndHandler = null;
    }
    if (context.map.getLayer(layerId)) {
      context.map.removeLayer(layerId);
    }
  });

  const geomaps = await loadGeomaps(context.datasetBaseUrl, geomapsPath);
  if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return false;

  try {
    layer.addImageInfos(buildAllmapsImageInfos(geomaps.imageInfos));
  } catch (error) {
    // non-fatal — Allmaps falls back to fetching info.json itself per canvas, but that is a
    // per-canvas network fetch (retried every rendered frame if it fails), so make it visible.
    console.warn(`[allmaps ${layerId}] addImageInfos failed — per-canvas info.json fetches will happen instead`, error);
  }

  const loadedCanvasIds = new Set<string>();
  const detachDiagnostics = attachAllmapsDiagnostics({
    label: layerId,
    map: context.map,
    layer,
    getLoadedCount: () => loadedCanvasIds.size,
  });
  registerIiifCleanup(context.paneId, target.sublayer.id, detachDiagnostics);
  const pendingQueue: NormalizedGeomapsCanvas[] = [];
  let draining = false;
  let started = false;
  const spritesImagePath = target.sublayer.artifacts.sprites;
  const spritesIndexPath = target.sublayer.artifacts.spritesIndex;

  let atlasPromise: Promise<IiifSpriteAtlas | null> | null = null;
  function getSpriteAtlas(): Promise<IiifSpriteAtlas | null> {
    if (!atlasPromise) {
      atlasPromise =
        spritesImagePath && spritesIndexPath ? loadSpriteAtlas(context.datasetBaseUrl, spritesImagePath, spritesIndexPath) : Promise.resolve(null);
    }
    return atlasPromise;
  }

  // Sprites must be uploaded AFTER the maps they cover exist in the warped-map list:
  // `BaseRenderer.addSprites` binds sprites to maps via `warpedMapsByResourceId` built from the
  // *current* list, and `spritesDataToCachedTiles` `break`s on the first sprite without a matching
  // map — uploading before any canvas is triangulated silently produces zero sprite tiles (every
  // canvas then fetches full-res IIIF tiles at all zooms; this was the branch's high-zoom pan-lag
  // regression vs main, which uploaded sprites after its addGeoreferencedMap batches). So: upload
  // once per drain, only the sprites for canvases added in that drain. The atlas URL gets a unique
  // fragment per batch because the sprites tile cache dedupes by tile URL and would ignore repeat
  // calls; fragments are stripped from the HTTP request, so the image bytes come from browser cache.
  // Sprites are an optimization: any failure is non-fatal — Allmaps fetches full-res tiles directly.
  let spriteBatchCounter = 0;
  let warnedSpritesUnavailable = false;
  async function uploadSpritesForCanvases(canvases: NormalizedGeomapsCanvas[]): Promise<void> {
    if (canvases.length === 0) return;

    if (!spritesImagePath || !spritesIndexPath) {
      if (!warnedSpritesUnavailable) {
        warnedSpritesUnavailable = true;
        console.warn(`[allmaps ${layerId}] no sprite artifacts on sublayer — full-res IIIF tiles will be fetched for every canvas`);
      }
      return;
    }

    const atlas = await getSpriteAtlas();
    if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return;
    if (!atlas) {
      if (!warnedSpritesUnavailable) {
        warnedSpritesUnavailable = true;
        console.warn(`[allmaps ${layerId}] sprite atlas failed to load (${spritesImagePath} / ${spritesIndexPath})`);
      }
      return;
    }

    const sprites = canvases
      .map((canvas) => atlas.spritesByImageServiceUrl.get(canvas.imageServiceUrl))
      .filter((sprite): sprite is IiifSprite => Boolean(sprite));
    if (sprites.length === 0) return;

    spriteBatchCounter += 1;
    try {
      await layer.addSprites(sprites, `${atlas.imageUrl}#batch-${spriteBatchCounter}`, atlas.imageSize);
    } catch (error) {
      console.warn(`[allmaps ${layerId}] addSprites failed for batch of ${sprites.length}`, error);
    }
  }

  function currentCenter(): [number, number] | null {
    try {
      const center = context.map.getCenter();
      return [center.lng, center.lat];
    } catch {
      return null;
    }
  }

  function paddedViewportBounds(margin: number): [number, number, number, number] | null {
    try {
      const bounds = context.map.getBounds();
      const marginX = (bounds.getEast() - bounds.getWest()) * margin;
      const marginY = (bounds.getNorth() - bounds.getSouth()) * margin;
      return [bounds.getWest() - marginX, bounds.getSouth() - marginY, bounds.getEast() + marginX, bounds.getNorth() + marginY];
    } catch {
      return null;
    }
  }

  // Single drainer: triangulates the queue RECONCILE_CHUNK entries per frame, re-prioritising by the
  // current viewport centre between chunks so the nearest maps always load first even mid-pan.
  // Each chunk's `addGeoreferencedMap` promises are awaited so the drain's sprite upload (see
  // `uploadSpritesForCanvases`) only runs once its canvases actually exist in the warped-map list.
  async function drainQueue(): Promise<void> {
    if (draining) return;
    draining = true;
    const addedThisDrain: NormalizedGeomapsCanvas[] = [];
    try {
      while (pendingQueue.length > 0) {
        if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return;
        const center = currentCenter();
        if (center) {
          pendingQueue.sort((a, b) => squaredDistance(a.geoCenter, center) - squaredDistance(b.geoCenter, center));
        }
        const chunk = pendingQueue.splice(0, RECONCILE_CHUNK);
        const results = await Promise.allSettled(
          chunk.map((canvas) =>
            layer.addGeoreferencedMap(canvas.georeferencedMap, {
              transformationType: context.allmapsOptions.transformationType,
              debugTriangles: context.allmapsOptions.debugTriangles,
            })
          )
        );
        const addedMapIds: string[] = [];
        for (const [index, result] of results.entries()) {
          if (result.status === 'fulfilled') {
            addedThisDrain.push(chunk[index]);
            addedMapIds.push(result.value);
          } else {
            // skip this canvas — its georeferencing data is likely malformed
            console.warn(`[allmaps ${layerId}] addGeoreferencedMap failed for canvas ${chunk[index].imageId}`, result.reason);
          }
        }
        if (context.allmapsOptions.showHighStretch && addedMapIds.length > 0) {
          // Allmaps ignores distortionMeasure during addGeoreferencedMap's init path.
          // Applying it afterwards triggers the option-change path and re-triangulation.
          layer.setMapsOptions(addedMapIds, { distortionMeasure: 'log2sigma' });
        }
        layer.nativeUpdate();
        if (pendingQueue.length > 0) await nextFrame();
      }
      await uploadSpritesForCanvases(addedThisDrain);
    } finally {
      draining = false;
    }
  }

  function reconcileViewport(): void {
    if (context.map.getZoom() < ALLMAPS_TRIGGER_ZOOM) return;
    const loadBounds = paddedViewportBounds(ALLMAPS_VIEWPORT_MARGIN);
    if (!loadBounds) return;

    let queued = false;
    for (const canvas of geomaps.canvases) {
      if (loadedCanvasIds.has(canvas.imageId)) continue;
      if (!canvas.geoBbox || bboxIntersects(canvas.geoBbox, loadBounds)) {
        loadedCanvasIds.add(canvas.imageId);
        pendingQueue.push(canvas);
        queued = true;
      }
    }
    if (queued) void drainQueue();
  }

  function startAllmaps(): void {
    if (started) return;
    started = true;
    if (zoomHandler) {
      context.map.off('zoom', zoomHandler);
      zoomHandler = null;
    }
    moveEndHandler = () => reconcileViewport();
    context.map.on('moveend', moveEndHandler);
    reconcileViewport();
  }

  if (context.map.getZoom() >= ALLMAPS_TRIGGER_ZOOM) {
    startAllmaps();
  } else {
    zoomHandler = () => {
      if (context.map.getZoom() >= ALLMAPS_TRIGGER_ZOOM) startAllmaps();
    };
    context.map.on('zoom', zoomHandler);
  }

  return true;
}
