import type maplibregl from 'maplibre-gl';
import type { SublayerRenderContext, SublayerRenderTarget } from './types';
import { removeRasterLayer, renderRasterLayer } from './rasterRenderer';

const MEANDER_RASTER_OPACITY = 1;
const BELGIUM_BOUNDS: [number, number, number, number] = [2.53, 50.685, 5.92, 51.52];
const REMOTE_RASTER_KINDS = new Set(['wmts', 'wms']);

function rendererId(paneId: string, sublayerId: string, role: 'source' | 'layer'): string {
  return `remote-${role}-${paneId}-${sublayerId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function canMutateStyle(map: maplibregl.Map): boolean {
  try {
    return map.isStyleLoaded() || map.loaded() || map.getStyle().layers.length > 0;
  } catch {
    return false;
  }
}

function renderRemoteRasterSublayer(context: SublayerRenderContext, target: SublayerRenderTarget, tileUrl: string): void {
  const sourceId = rendererId(context.paneId, target.sublayer.id, 'source');
  const layerId = rendererId(context.paneId, target.sublayer.id, 'layer');
  renderRasterLayer(context.map, {
    sourceId,
    layerId,
    tileUrl,
    bounds: BELGIUM_BOUNDS,
    opacity: MEANDER_RASTER_OPACITY,
  });
}

export function canRenderRemoteSublayer(target: SublayerRenderTarget): boolean {
  return target.sublayer.source?.type === 'remote' && REMOTE_RASTER_KINDS.has(target.sublayer.kind);
}

export function renderRemoteSublayer(context: SublayerRenderContext, target: SublayerRenderTarget): boolean {
  const tileUrl = target.sublayer.source?.url;
  if (!tileUrl || !canRenderRemoteSublayer(target) || !canMutateStyle(context.map)) return false;

  try {
    renderRemoteRasterSublayer(context, target, tileUrl);
    return true;
  } catch {
    return false;
  }
}

/** Maplibre layer ids this renderer may create for a sublayer, bottom-to-top. */
export function remoteSublayerLayerIds(paneId: string, sublayerId: string): string[] {
  return [rendererId(paneId, sublayerId, 'layer')];
}

export function removeRemoteSublayer(context: SublayerRenderContext, sublayerId: string): void {
  const sourceId = rendererId(context.paneId, sublayerId, 'source');
  const layerId = rendererId(context.paneId, sublayerId, 'layer');

  removeRasterLayer(context.map, sourceId, layerId);
}
