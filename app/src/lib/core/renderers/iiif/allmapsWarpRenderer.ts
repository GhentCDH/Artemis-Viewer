import { WarpedMapLayer } from '@allmaps/maplibre';
import type { SublayerRenderContext, SublayerRenderTarget } from '../types';
import { loadGeomaps } from './geomapsLoader';
import { attachAllmapsDiagnostics } from './iiifAllmapsDiagnostics';
import type { NormalizedGeomapsCanvas } from './geomapsTypes';
import { buildAllmapsImageInfos } from './iiifImageInfo';
import { iiifLayerId, isCurrentIiifRender, registerIiifCleanup } from './iiifLayerRuntime';
import { joinUrl, loadSpriteAtlas, loadSpriteIndex, type IiifSprite, type IiifSpriteAtlas } from './iiifSpriteAtlas';

// Below this zoom the raster preview alone is the renderer — visually equivalent at overview
// zoom, but free of Allmaps' per-canvas triangulation cost.
const ALLMAPS_TRIGGER_ZOOM = 12.5;
// Viewport-driven loading: only canvases whose footprint intersects the viewport, padded by this
// fraction on each side, are triangulated. Quick experiment: dropped from 0.5 (main's value) to
// cut how many canvases a single pan reveal queues — at 0.5 the padded load area is ~4x the
// visible viewport; at 0.15 it's ~1.7x, much closer to what's actually on screen.
const ALLMAPS_VIEWPORT_MARGIN = 0.15;
// Keep maps for a substantially larger area than the load viewport. This bounds GPU/JS
// residency without making an ordinary back-and-forth pan repeatedly destroy and triangulate
// the same canvas. At 1.0 the retained area extends one full viewport on every side (3x linear,
// 9x area), versus the 1.3x-linear load area above.
const ALLMAPS_EVICTION_VIEWPORT_MARGIN = 1.0;
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
 * until the map reaches `ALLMAPS_TRIGGER_ZOOM` in sequential mode — the raster preview underneath
 * is the renderer until then. Eager mode submits every canvas as soon as the geomaps bundle is
 * available, matching the original full-layer render path.
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
  //
  // The tuned defaults live in ALLMAPS_TUNING_DEFAULTS (developerSettings); each knob is
  // adjustable at runtime via the branding panel's Advanced Allmaps developer menu. In brief:
  // - log2ScaleFactorCorrection 0: fetch tiles at the nearest IIIF scale factor instead of the
  //   default half-step finer (-0.5 ≈ 2× the tiles for sharpness that barely registers).
  // - pruneViewportBufferRatio 2: keep viewport tiles for a 5×-linear-viewport pan-back region
  //   instead of 17× (1 measured too aggressive: panning back triggered thousands of refetches).
  // - overview*ViewportBufferRatio 2/4: request whole-image low-res fallback tiles within 5×,
  //   keep within 9× linear viewport instead of 17×/33×.
  // - maxTotalOverviewResolutionRatio: budget for total overview-tile resolution relative to the
  //   viewport's; 0 disables overview tiles entirely (Allmaps' own default is 50).
  // - overviewTilesMaxResolution/-Selection: per-map overview cap and zoom-level choice.
  const tuning = context.allmapsOptions.tuning;
  const layer = new WarpedMapLayer({
    layerId,
    log2ScaleFactorCorrection: tuning.log2ScaleFactorCorrection,
    pruneViewportBufferRatio: tuning.pruneViewportBufferRatio,
    overviewRequestViewportBufferRatio: tuning.overviewRequestViewportBufferRatio,
    overviewPruneViewportBufferRatio: tuning.overviewPruneViewportBufferRatio,
    maxTotalOverviewResolutionRatio: tuning.maxTotalOverviewResolutionRatio,
    overviewTilesMaxResolution: tuning.overviewTilesMaxResolution,
    overviewTilesSelection: tuning.overviewTilesSelection,
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

  const geomapsStartedAt = performance.now();
  const geomaps = await loadGeomaps(context.datasetBaseUrl, geomapsPath);
  if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return false;

  try {
    layer.addImageInfos(buildAllmapsImageInfos(geomaps.imageInfos));
  } catch (error) {
    // non-fatal — Allmaps falls back to fetching info.json itself per canvas, but that is a
    // per-canvas network fetch (retried every rendered frame if it fails), so make it visible.
    console.warn(`[allmaps ${layerId}] addImageInfos failed — per-canvas info.json fetches will happen instead`, error);
  }

  // A canvas must be in exactly one of these lifecycle states. In particular, don't mark it as
  // resident before addGeoreferencedMap succeeds: doing so used to make malformed maps
  // permanently look loaded, and makes removal/re-entry races impossible to reason about.
  const queuedCanvasIds = new Set<string>();
  const addingCanvasIds = new Set<string>();
  const residentMapIdsByCanvasId = new Map<string, string>();
  const failedCanvasIds = new Set<string>();
  const pendingQueue: NormalizedGeomapsCanvas[] = [];
  let draining = false;
  let started = false;
  let spriteBatchCounter = 0;
  const detachDiagnostics = attachAllmapsDiagnostics({
    label: layerId,
    map: context.map,
    layer,
    getLoadedCount: () => residentMapIdsByCanvasId.size,
    getRuntimeState: () => ({
      queued: queuedCanvasIds.size,
      adding: addingCanvasIds.size,
      failed: failedCanvasIds.size,
      draining,
      started,
      spriteBatches: spriteBatchCounter,
    }),
    enabled: context.allmapsOptions.diagnostics,
  });
  registerIiifCleanup(context.paneId, target.sublayer.id, detachDiagnostics);
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

  let spriteIndexPromise: Promise<Map<string, IiifSprite>> | null = null;
  function getSpriteIndex(): Promise<Map<string, IiifSprite>> {
    if (!spriteIndexPromise) {
      spriteIndexPromise = spritesIndexPath ? loadSpriteIndex(context.datasetBaseUrl, spritesIndexPath) : Promise.resolve(new Map());
    }
    return spriteIndexPromise;
  }

  // Sprites must be uploaded AFTER the maps they cover exist in the warped-map list:
  // `BaseRenderer.addSprites` binds sprites to maps via `warpedMapsByResourceId` built from the
  // *current* list, and `spritesDataToCachedTiles` `break`s on the first sprite without a matching
  // map — uploading before any canvas is triangulated silently produces zero sprite tiles (every
  // canvas then fetches full-res IIIF tiles at all zooms; this was the branch's high-zoom pan-lag
  // regression vs main, which uploaded sprites after its addGeoreferencedMap batches). So: upload
  // once per drain, only the sprites for canvases added in that drain.
  // Sprites are an optimization: any failure is non-fatal — Allmaps fetches full-res tiles directly.
  let warnedSpritesUnavailable = false;
  async function uploadSpritesForCanvases(canvases: NormalizedGeomapsCanvas[]): Promise<void> {
    if (canvases.length === 0) return;

    if (!context.allmapsOptions.spritesEnabled) {
      if (!warnedSpritesUnavailable) {
        warnedSpritesUnavailable = true;
        console.info(`[allmaps ${layerId}] sprite rendering disabled via developer settings — full-res IIIF tiles will be fetched for every canvas`);
      }
      return;
    }

    if (!spritesImagePath || !spritesIndexPath) {
      if (!warnedSpritesUnavailable) {
        warnedSpritesUnavailable = true;
        console.warn(`[allmaps ${layerId}] no sprite artifacts on sublayer — full-res IIIF tiles will be fetched for every canvas`);
      }
      return;
    }

    // Sequential (viewport-driven) mode only ever needs one canvas's sprite at a time — reuse the
    // per-canvas file each build now writes alongside the shared sheet (see IiifSprite.file)
    // instead of re-decoding/re-uploading the whole shared sheet on every drain batch (that decode
    // was the heavy step: `addSprites` treats its imageUrl as a single tile, so the *entire* sheet
    // gets fetched and rasterized just to crop out a handful of sprites). Eager mode still wants
    // the shared sheet: it uploads every canvas at once, so one decode amortizes across all of them.
    if (context.allmapsOptions.loadingMode === 'sequential') {
      await uploadSpritesFromPerCanvasFiles(canvases);
    } else {
      await uploadSpritesFromAtlas(canvases);
    }
  }

  async function uploadSpritesFromPerCanvasFiles(canvases: NormalizedGeomapsCanvas[]): Promise<void> {
    const index = await getSpriteIndex();
    if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return;
    if (index.size === 0) {
      if (!warnedSpritesUnavailable) {
        warnedSpritesUnavailable = true;
        console.warn(`[allmaps ${layerId}] sprite index failed to load (${spritesIndexPath})`);
      }
      return;
    }

    const needsAtlasFallback: NormalizedGeomapsCanvas[] = [];
    const uploads: Promise<void>[] = [];
    for (const canvas of canvases) {
      const sprite = index.get(canvas.imageServiceUrl);
      if (!sprite) continue;
      if (!sprite.file) {
        // Older build without per-canvas sprite files — fall back to the shared sheet for this one.
        needsAtlasFallback.push(canvas);
        continue;
      }
      const fileUrl = joinUrl(context.datasetBaseUrl, sprite.file);
      // The per-canvas file is already cropped to just this sprite, so it occupies the whole image.
      const singleSprite: IiifSprite = { ...sprite, x: 0, y: 0 };
      uploads.push(
        layer.addSprites([singleSprite], fileUrl, [sprite.width, sprite.height]).then(
          () => undefined,
          (error) => console.warn(`[allmaps ${layerId}] addSprites failed for canvas ${canvas.imageId}`, error)
        )
      );
    }

    if (uploads.length > 0) {
      console.info(`[allmaps ${layerId}] addSprites (per-canvas files): ${uploads.length} canvases`);
      await Promise.all(uploads);
      // Each canvas's sprite crop has been handed to the main tile cache by the time addSprites
      // resolves, so the decoded source copy in spritesTileCache is dead weight — see the same
      // note on uploadSpritesFromAtlas.
      layer.renderer?.spritesTileCache.clear();
    }
    if (needsAtlasFallback.length > 0) await uploadSpritesFromAtlas(needsAtlasFallback);
  }

  async function uploadSpritesFromAtlas(canvases: NormalizedGeomapsCanvas[]): Promise<void> {
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
    console.info(
      `[allmaps ${layerId}] addSprites batch ${spriteBatchCounter}: ${sprites.length} sprites (${canvases.length} canvases, atlas ${atlas.imageSize[0]}×${atlas.imageSize[1]})`
    );
    try {
      // The atlas URL gets a unique fragment per batch because the sprites tile cache dedupes by
      // tile URL and would ignore repeat calls; fragments are stripped from the HTTP request, so
      // the image bytes still come from browser cache.
      await layer.addSprites(sprites, `${atlas.imageUrl}#batch-${spriteBatchCounter}`, atlas.imageSize);
    } catch (error) {
      console.warn(`[allmaps ${layerId}] addSprites failed for batch of ${sprites.length}`, error);
    } finally {
      // Each batch's unique #batch-N URL pins a full decoded RGBA copy of the atlas
      // (~86MB for the largest layer) in Allmaps' spritesTileCache, which is never pruned —
      // panning leaked one copy per drain. By the time addSprites resolves, the clipped
      // per-canvas thumbnails have been handed to the main tile cache, so the atlas copy
      // is dead weight and safe to drop.
      layer.renderer?.spritesTileCache.clear();
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
        for (const canvas of chunk) {
          queuedCanvasIds.delete(canvas.imageId);
          addingCanvasIds.add(canvas.imageId);
        }
        const results = await Promise.allSettled(
          chunk.map((canvas) =>
            layer.addGeoreferencedMap(canvas.georeferencedMap, {
              transformationType: context.allmapsOptions.transformationType,
              debugTriangles: context.allmapsOptions.debugTriangles,
            })
          )
        );
        const addedMapIds: string[] = [];
        const evictionBounds = paddedViewportBounds(ALLMAPS_EVICTION_VIEWPORT_MARGIN);
        for (const [index, result] of results.entries()) {
          const canvas = chunk[index];
          addingCanvasIds.delete(canvas.imageId);
          if (result.status === 'fulfilled') {
            // The camera may have moved while triangulation was in flight. Destroy a map that is
            // already outside the wider retention bounds instead of briefly making it resident
            // and uploading its sprite. Missing bboxes are deliberately never evicted.
            if (evictionBounds && canvas.geoBbox && !bboxIntersects(canvas.geoBbox, evictionBounds)) {
              try {
                layer.removeGeoreferencedMapById(result.value);
              } catch (error) {
                // The add succeeded, so retain ownership if removal unexpectedly fails. Losing
                // this ID would leave an Allmaps map that the reconciler can never remove.
                residentMapIdsByCanvasId.set(canvas.imageId, result.value);
                console.warn(`[allmaps ${layerId}] immediate removeGeoreferencedMapById failed for canvas ${canvas.imageId}`, error);
              }
            } else {
              residentMapIdsByCanvasId.set(canvas.imageId, result.value);
              addedThisDrain.push(canvas);
              addedMapIds.push(result.value);
            }
          } else {
            // skip this canvas — its georeferencing data is likely malformed
            failedCanvasIds.add(canvas.imageId);
            console.warn(`[allmaps ${layerId}] addGeoreferencedMap failed for canvas ${canvas.imageId}`, result.reason);
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
      // A moveend can evict maps while another chunk is being triangulated. Only upload sprites
      // for maps that still exist when this drain finishes.
      await uploadSpritesForCanvases(addedThisDrain.filter((canvas) => residentMapIdsByCanvasId.has(canvas.imageId)));
    } finally {
      draining = false;
      // A moveend may enqueue work while this drain is awaiting sprite decoding/upload. Its
      // drainQueue call sees `draining` and returns, so explicitly hand off after lowering the
      // guard or those canvases remain queued forever.
      if (pendingQueue.length > 0 && isCurrentIiifRender(context.paneId, target.sublayer.id, token)) {
        void drainQueue();
      }
    }
  }

  function reconcileViewport(): void {
    if (context.map.getZoom() < ALLMAPS_TRIGGER_ZOOM) return;
    const loadBounds = paddedViewportBounds(ALLMAPS_VIEWPORT_MARGIN);
    const evictionBounds = paddedViewportBounds(ALLMAPS_EVICTION_VIEWPORT_MARGIN);
    if (!loadBounds || !evictionBounds) return;

    // Cancel queued work that has become irrelevant after a large/rapid pan. Work already inside
    // addGeoreferencedMap cannot be cancelled, so drainQueue checks the current eviction bounds
    // again as soon as that call resolves.
    for (let index = pendingQueue.length - 1; index >= 0; index -= 1) {
      const canvas = pendingQueue[index];
      if (canvas.geoBbox && !bboxIntersects(canvas.geoBbox, evictionBounds)) {
        pendingQueue.splice(index, 1);
        queuedCanvasIds.delete(canvas.imageId);
      }
    }

    // removeGeoreferencedMapById reaches WebGL2WarpedMap.destroy(), releasing the map's texture
    // arrays and VAOs and cancelling its throttled texture work. Allmaps' shared tile cache may
    // retain reusable tile entries until its normal pruning runs; missing bboxes stay resident
    // because there is no safe spatial eviction decision for them.
    for (const canvas of geomaps.canvases) {
      const mapId = residentMapIdsByCanvasId.get(canvas.imageId);
      if (!mapId || !canvas.geoBbox || bboxIntersects(canvas.geoBbox, evictionBounds)) continue;
      try {
        layer.removeGeoreferencedMapById(mapId);
        residentMapIdsByCanvasId.delete(canvas.imageId);
      } catch (error) {
        console.warn(`[allmaps ${layerId}] removeGeoreferencedMapById failed for canvas ${canvas.imageId}`, error);
      }
    }

    let queued = false;
    for (const canvas of geomaps.canvases) {
      if (
        residentMapIdsByCanvasId.has(canvas.imageId) ||
        queuedCanvasIds.has(canvas.imageId) ||
        addingCanvasIds.has(canvas.imageId) ||
        failedCanvasIds.has(canvas.imageId)
      ) {
        continue;
      }
      if (!canvas.geoBbox || bboxIntersects(canvas.geoBbox, loadBounds)) {
        queuedCanvasIds.add(canvas.imageId);
        pendingQueue.push(canvas);
        queued = true;
      }
    }
    if (queued) void drainQueue();
  }

  async function loadAllEagerly(): Promise<void> {
    const eagerStartedAt = performance.now();
    const results = await Promise.allSettled(
      geomaps.canvases.map((canvas) =>
        layer.addGeoreferencedMap(canvas.georeferencedMap, {
          transformationType: context.allmapsOptions.transformationType,
          debugTriangles: context.allmapsOptions.debugTriangles,
        })
      )
    );
    const mapsFinishedAt = performance.now();
    if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return;

    const addedCanvases: NormalizedGeomapsCanvas[] = [];
    const addedMapIds: string[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        const canvas = geomaps.canvases[index];
        residentMapIdsByCanvasId.set(canvas.imageId, result.value);
        addedCanvases.push(canvas);
        addedMapIds.push(result.value);
      } else {
        failedCanvasIds.add(geomaps.canvases[index].imageId);
        console.warn(`[allmaps ${layerId}] addGeoreferencedMap failed for canvas ${geomaps.canvases[index].imageId}`, result.reason);
      }
    }
    if (context.allmapsOptions.showHighStretch && addedMapIds.length > 0) {
      layer.setMapsOptions(addedMapIds, { distortionMeasure: 'log2sigma' });
    }
    layer.nativeUpdate();
    await uploadSpritesForCanvases(addedCanvases);
    const finishedAt = performance.now();
    if (context.allmapsOptions.diagnostics && isCurrentIiifRender(context.paneId, target.sublayer.id, token)) {
      console.info(`[allmaps-eager ${layerId}] complete`, {
        totalMs: Math.round(finishedAt - geomapsStartedAt),
        loadGeomapsMs: Math.round(eagerStartedAt - geomapsStartedAt),
        addMapsMs: Math.round(mapsFinishedAt - eagerStartedAt),
        addSpritesMs: Math.round(finishedAt - mapsFinishedAt),
        canvases: geomaps.canvases.length,
        succeeded: addedCanvases.length,
        failed: geomaps.canvases.length - addedCanvases.length,
      });
    }
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

  if (context.allmapsOptions.loadingMode === 'eager') {
    void loadAllEagerly();
  } else if (context.map.getZoom() >= ALLMAPS_TRIGGER_ZOOM) {
    startAllmaps();
  } else {
    zoomHandler = () => {
      if (context.map.getZoom() >= ALLMAPS_TRIGGER_ZOOM) startAllmaps();
    };
    context.map.on('zoom', zoomHandler);
  }

  return true;
}
