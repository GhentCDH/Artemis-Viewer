import { WarpedMapLayer } from '@allmaps/maplibre';
import type { SublayerRenderContext, SublayerRenderTarget } from '../types';
import { loadGeomaps } from './geomapsLoader';
import type { NormalizedGeomapsCanvas } from './geomapsTypes';
import { buildAllmapsImageInfos } from './iiifImageInfo';
import { iiifLayerId, isCurrentIiifRender, registerIiifCleanup } from './iiifLayerRuntime';
import { loadSpriteAtlas, type IiifSprite, type IiifSpriteAtlas } from './iiifSpriteAtlas';

// Below this zoom the raster preview alone is the renderer — visually equivalent at overview
// zoom, but free of Allmaps' per-canvas triangulation cost.
const ALLMAPS_TRIGGER_ZOOM = 12.5;
// Viewport-driven loading: only canvases whose footprint intersects the viewport, padded by this
// fraction on each side, are triangulated.
const ALLMAPS_VIEWPORT_MARGIN = 0.5;
// Canvases triangulated per animation frame while draining the load queue, so a big reconcile
// never blocks a frame.
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
  const layer = new WarpedMapLayer({ layerId });
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
  } catch {
    // non-fatal — Allmaps falls back to fetching info.json itself per canvas
  }

  const loadedCanvasIds = new Set<string>();
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

  // `WarpedMapLayer.addSprites` internally walks the renderer's *entire* accumulated warped-map
  // list every call, not just the sprites passed in (see `BaseRenderer.addSprites`), so calling it
  // once per newly-revealed viewport chunk means every subsequent pan pays a cost proportional to
  // everything loaded across the whole session so far — the longer you pan around a collection, the
  // more each new reveal costs. Matching main's original implementation: call it exactly once per
  // group, up front, before any canvas has been triangulated. Sprites are an optimization: any
  // failure here is non-fatal — canvases still triangulate and Allmaps fetches full-resolution tiles
  // directly.
  let spritesUploaded = false;
  async function ensureSpritesUploaded(): Promise<void> {
    if (spritesUploaded) return;
    spritesUploaded = true;

    const atlas = await getSpriteAtlas();
    if (!atlas || !isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return;

    const sprites = geomaps.canvases
      .map((canvas) => atlas.spritesByImageServiceUrl.get(canvas.imageServiceUrl))
      .filter((sprite): sprite is IiifSprite => Boolean(sprite));
    if (sprites.length === 0) return;

    try {
      await layer.addSprites(sprites, atlas.imageUrl, atlas.imageSize);
    } catch {
      // non-fatal
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
  async function drainQueue(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      await ensureSpritesUploaded();
      while (pendingQueue.length > 0) {
        if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return;
        const center = currentCenter();
        if (center) {
          pendingQueue.sort((a, b) => squaredDistance(a.geoCenter, center) - squaredDistance(b.geoCenter, center));
        }
        const chunk = pendingQueue.splice(0, RECONCILE_CHUNK);
        for (const canvas of chunk) {
          try {
            layer.addGeoreferencedMap(canvas.georeferencedMap);
          } catch {
            // skip this canvas — its georeferencing data is likely malformed
          }
        }
        layer.nativeUpdate();
        if (pendingQueue.length > 0) await nextFrame();
      }
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
