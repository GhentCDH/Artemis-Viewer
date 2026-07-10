import type maplibregl from 'maplibre-gl';
import type { SublayerRenderContext, SublayerRenderTarget } from '../types';
import { iiifLayerId, iiifSourceId, registerIiifCleanup } from './iiifLayerRuntime';

const RASTER_PREVIEW_OPACITY = 1;

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function rasterPmtilesUrl(context: SublayerRenderContext, target: SublayerRenderTarget): string | null {
  const artifactPath = target.sublayer.artifacts.raster;
  if (!artifactPath) return null;
  const artifactUrl = /^https?:\/\//i.test(artifactPath) ? artifactPath : joinUrl(context.datasetBaseUrl, artifactPath);
  return `pmtiles://${artifactUrl}`;
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

export function canRenderIiifRasterPreview(target: SublayerRenderTarget): boolean {
  return Boolean(target.sublayer.artifacts.raster);
}

/**
 * In sequential mode the raster preview is a permanent base layer for the IIIF group's lifetime,
 * not a loading placeholder: it stays visible below the incrementally populated Allmaps layer.
 * Eager mode does not call this renderer and displays the Allmaps warp by itself.
 */
export function renderIiifRasterPreview(context: SublayerRenderContext, target: SublayerRenderTarget): boolean {
  const url = rasterPmtilesUrl(context, target);
  if (!url) return false;

  const sourceId = iiifSourceId(context.paneId, target.sublayer.id, 'raster');
  const layerId = iiifLayerId(context.paneId, target.sublayer.id, 'raster');

  if (!context.map.getSource(sourceId)) {
    context.map.addSource(sourceId, {
      type: 'raster',
      url,
      tileSize: 256,
    });
  }

  if (!context.map.getLayer(layerId)) {
    context.map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': RASTER_PREVIEW_OPACITY,
      },
    });
  }

  registerIiifCleanup(context.paneId, target.sublayer.id, () => {
    removeLayerIfPresent(context.map, layerId);
    removeSourceIfPresent(context.map, sourceId);
  });

  return true;
}
