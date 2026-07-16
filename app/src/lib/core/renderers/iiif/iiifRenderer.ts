import type maplibregl from 'maplibre-gl';
import type { SublayerRenderContext, SublayerRenderTarget } from '../types';
import { beginIiifRender, iiifLayerId, isCurrentIiifRender, removeIiifGroup } from './iiifLayerRuntime';
import { canRenderIiifMasks, renderIiifMasks } from './iiifMaskRenderer';
import { canRenderIiifRasterPreview, renderIiifRasterPreview } from './iiifRasterPreviewRenderer';

function canMutateStyle(map: maplibregl.Map): boolean {
  try {
    return map.isStyleLoaded() || map.loaded() || map.getStyle().layers.length > 0;
  } catch {
    return false;
  }
}

/**
 * Mirrors allmapsWarpRenderer's canRenderIiifAllmapsWarp. Kept local so the availability
 * check stays synchronous while the warp renderer itself — the only static importer of the
 * ~560 KB @allmaps vendor chunk — loads via dynamic import the first time a warp actually
 * renders, keeping it off the startup critical path.
 */
function hasGeomapsArtifact(target: SublayerRenderTarget): boolean {
  return Boolean(target.sublayer.artifacts.geomaps);
}

export function canRenderIiifSublayer(target: SublayerRenderTarget): boolean {
  return target.sublayer.kind === 'iiif' && (canRenderIiifRasterPreview(target) || hasGeomapsArtifact(target));
}

/**
 * Async because later phases fetch geomaps/image-info/sprite metadata before the
 * Allmaps warp can start. The render token guards against a rapid toggle-off/on
 * resurrecting layers that `removeIiifSublayer` already tore down.
 */
export async function renderIiifSublayer(context: SublayerRenderContext, target: SublayerRenderTarget): Promise<boolean> {
  if (!canRenderIiifSublayer(target) || !canMutateStyle(context.map)) return false;

  const token = beginIiifRender(context.paneId, target.sublayer.id);
  if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return false;

  console.info(
    `[iiif ${context.paneId}] render ${target.layerId}/${target.sublayer.id} layer using ${context.allmapsOptions.loadingMode} rendering path`,
  );

  if (context.allmapsOptions.loadingMode === 'sequential') {
    let renderedRasterPreview = false;
    try {
      renderedRasterPreview = renderIiifRasterPreview(context, target);
    } catch {
      renderedRasterPreview = false;
    }
    if (!renderedRasterPreview) return false;
  } else if (!hasGeomapsArtifact(target)) {
    return false;
  }

  if (canRenderIiifMasks(target)) {
    renderIiifMasks(context, target);
  }

  if (hasGeomapsArtifact(target)) {
    // The chunk load introduces an await between token creation and the warp render, so the
    // token is re-checked before starting: renderIiifAllmapsWarp adds its maplibre layer
    // synchronously on entry, and a stale call would resurrect a layer whose sublayer was
    // toggled off while the import was in flight.
    void import('./allmapsWarpRenderer')
      .then(({ renderIiifAllmapsWarp }) => {
        if (!isCurrentIiifRender(context.paneId, target.sublayer.id, token)) return false;
        return renderIiifAllmapsWarp(context, target, token);
      })
      .catch(() => {});
  }

  return true;
}

/** Maplibre layer ids this renderer may create for a sublayer, bottom-to-top. */
export function iiifSublayerLayerIds(paneId: string, sublayerId: string): string[] {
  return [
    iiifLayerId(paneId, sublayerId, 'raster'),
    iiifLayerId(paneId, sublayerId, 'allmaps-warp'),
    // Keep the transparent interaction surface above every visible representation.
    iiifLayerId(paneId, sublayerId, 'masks'),
    iiifLayerId(paneId, sublayerId, 'mask-active-fill'),
    iiifLayerId(paneId, sublayerId, 'mask-active-outline'),
    iiifLayerId(paneId, sublayerId, 'mask-outline'),
  ];
}

export function removeIiifSublayer(context: SublayerRenderContext, sublayerId: string): void {
  beginIiifRender(context.paneId, sublayerId);
  removeIiifGroup(context.paneId, sublayerId);
}
