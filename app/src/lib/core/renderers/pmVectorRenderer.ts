import type maplibregl from 'maplibre-gl';
import { readThemeColor } from '$lib/core/map/mapColors';
import type { SublayerRenderContext, SublayerRenderTarget } from './types';

const SOURCE_LAYER = 'parcels';

function rendererId(paneId: string, sublayerId: string, role: 'source' | 'fill' | 'line'): string {
  return `pmvector-${role}-${paneId}-${sublayerId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function canMutateStyle(map: maplibregl.Map): boolean {
  try {
    return map.isStyleLoaded() || map.loaded() || map.getStyle().layers.length > 0;
  } catch {
    return false;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function artifactPmtilesUrl(context: SublayerRenderContext, target: SublayerRenderTarget): string | null {
  const artifactPath = target.sublayer.artifacts.parcels;
  if (!artifactPath) return null;
  const artifactUrl = /^https?:\/\//i.test(artifactPath) ? artifactPath : joinUrl(context.datasetBaseUrl, artifactPath);
  return artifactUrl.startsWith('pmtiles://') ? artifactUrl : `pmtiles://${artifactUrl}`;
}

function removeLayerIfPresent(map: maplibregl.Map, layerId: string): void {
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
}

function removeSourceIfPresent(map: maplibregl.Map, sourceId: string): void {
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

export function canRenderPmVectorSublayer(target: SublayerRenderTarget): boolean {
  return target.sublayer.kind === 'geojson' && Boolean(target.sublayer.artifacts.parcels);
}

export function renderPmVectorSublayer(context: SublayerRenderContext, target: SublayerRenderTarget): boolean {
  const url = artifactPmtilesUrl(context, target);
  if (!url || !canRenderPmVectorSublayer(target) || !canMutateStyle(context.map)) return false;

  const sourceId = rendererId(context.paneId, target.sublayer.id, 'source');
  const fillLayerId = rendererId(context.paneId, target.sublayer.id, 'fill');
  const lineLayerId = rendererId(context.paneId, target.sublayer.id, 'line');

  try {
    if (!context.map.getSource(sourceId)) {
      context.map.addSource(sourceId, {
        type: 'vector',
        url,
      });
    }

    if (!context.map.getLayer(fillLayerId)) {
      context.map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        'source-layer': SOURCE_LAYER,
        filter: ['==', ['get', 'type'], 'parcel'],
        paint: {
          'fill-color': readThemeColor('--color-map-parcel-fill', '#c07b28'),
          'fill-opacity': 0.001,
        },
      });
    }

    if (!context.map.getLayer(lineLayerId)) {
      context.map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        'source-layer': SOURCE_LAYER,
        filter: ['==', ['get', 'type'], 'parcel'],
        paint: {
          'line-color': readThemeColor('--color-map-parcel-line', '#c07b28'),
          'line-width': 1.1,
          'line-opacity': 1,
        },
      });
    }

    return true;
  } catch {
    return false;
  }
}

export function removePmVectorSublayer(context: SublayerRenderContext, sublayerId: string): void {
  const sourceId = rendererId(context.paneId, sublayerId, 'source');
  const fillLayerId = rendererId(context.paneId, sublayerId, 'fill');
  const lineLayerId = rendererId(context.paneId, sublayerId, 'line');

  removeLayerIfPresent(context.map, lineLayerId);
  removeLayerIfPresent(context.map, fillLayerId);
  removeSourceIfPresent(context.map, sourceId);
}
