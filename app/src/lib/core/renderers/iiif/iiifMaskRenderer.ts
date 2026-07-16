import type maplibregl from 'maplibre-gl';
import { readThemeColor, readThemeNumber } from '$lib/core/map/mapColors';
import type { SublayerRenderContext, SublayerRenderTarget } from '../types';
import { iiifLayerId, iiifSourceId, registerIiifCleanup } from './iiifLayerRuntime';

const PMTILES_SOURCE_LAYER = 'masks';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function artifactUrl(context: SublayerRenderContext, target: SublayerRenderTarget): string | null {
  const artifactPath = target.sublayer.artifacts.masks;
  if (!artifactPath) return null;
  return /^(?:https?|pmtiles):\/\//i.test(artifactPath) ? artifactPath : joinUrl(context.datasetBaseUrl, artifactPath);
}

function isPmtilesUrl(url: string): boolean {
  return url.split(/[?#]/, 1)[0].toLowerCase().endsWith('.pmtiles');
}

export function canRenderIiifMasks(target: SublayerRenderTarget): boolean {
  return target.sublayer.kind === 'iiif' && Boolean(target.sublayer.artifacts.masks);
}

/**
 * Adds the canvas footprints used for IIIF hit-testing. Current data builds publish
 * GeoJSON, while older and larger builds publish the same `imageId`/`manifestUrl`
 * feature contract as a PMTiles vector archive, so the artifact extension selects
 * the MapLibre source shape.
 */
export function renderIiifMasks(context: SublayerRenderContext, target: SublayerRenderTarget): boolean {
  const url = artifactUrl(context, target);
  if (!url || !canRenderIiifMasks(target)) return false;

  const sourceId = iiifSourceId(context.paneId, target.sublayer.id, 'masks');
  const layerId = iiifLayerId(context.paneId, target.sublayer.id, 'masks');
  const activeFillLayerId = iiifLayerId(context.paneId, target.sublayer.id, 'mask-active-fill');
  const activeOutlineLayerId = iiifLayerId(context.paneId, target.sublayer.id, 'mask-active-outline');
  const outlineLayerId = iiifLayerId(context.paneId, target.sublayer.id, 'mask-outline');
  const usesPmtiles = isPmtilesUrl(url);

  try {
    if (!context.map.getSource(sourceId)) {
      context.map.addSource(
        sourceId,
        usesPmtiles
          ? { type: 'vector', url: url.startsWith('pmtiles://') ? url : `pmtiles://${url}` }
          : { type: 'geojson', data: url }
      );
    }

    if (!context.map.getLayer(layerId)) {
      context.map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        ...(usesPmtiles ? { 'source-layer': PMTILES_SOURCE_LAYER } : {}),
        paint: {
          // Hit-test surface only. The selected geometry is drawn separately as an
          // outline, so hovering never adds a visible fill over the historical map.
          'fill-opacity': 0,
        },
      });
    }

    if (!context.map.getLayer(outlineLayerId)) {
      context.map.addLayer({
        id: activeFillLayerId,
        type: 'fill',
        source: sourceId,
        ...(usesPmtiles ? { 'source-layer': PMTILES_SOURCE_LAYER } : {}),
        filter: ['==', ['get', 'manifestUrl'], ''],
        paint: {
          'fill-color': readThemeColor('--color-accent', '#2f6f99'),
          'fill-opacity': readThemeNumber('--opacity-iiif-active-mask', 0.22),
        },
      });
      context.map.addLayer({
        id: activeOutlineLayerId,
        type: 'line',
        source: sourceId,
        ...(usesPmtiles ? { 'source-layer': PMTILES_SOURCE_LAYER } : {}),
        filter: ['==', ['get', 'manifestUrl'], ''],
        paint: {
          'line-color': readThemeColor('--color-accent', '#2f6f99'),
          'line-width': 2,
          'line-opacity': 1,
        },
      });
      context.map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: sourceId,
        ...(usesPmtiles ? { 'source-layer': PMTILES_SOURCE_LAYER } : {}),
        filter: ['==', ['get', 'manifestUrl'], ''],
        paint: {
          'line-color': readThemeColor('--color-accent', '#2f6f99'),
          'line-width': 1.5,
          'line-opacity': 0.9,
        },
      });
    }

    registerIiifCleanup(context.paneId, target.sublayer.id, () => {
      if (context.map.getLayer(outlineLayerId)) context.map.removeLayer(outlineLayerId);
      if (context.map.getLayer(activeOutlineLayerId)) context.map.removeLayer(activeOutlineLayerId);
      if (context.map.getLayer(activeFillLayerId)) context.map.removeLayer(activeFillLayerId);
      if (context.map.getLayer(layerId)) context.map.removeLayer(layerId);
      if (context.map.getSource(sourceId)) context.map.removeSource(sourceId);
    });
    return true;
  } catch {
    if (context.map.getLayer(outlineLayerId)) context.map.removeLayer(outlineLayerId);
    if (context.map.getLayer(activeOutlineLayerId)) context.map.removeLayer(activeOutlineLayerId);
    if (context.map.getLayer(activeFillLayerId)) context.map.removeLayer(activeFillLayerId);
    if (context.map.getLayer(layerId)) context.map.removeLayer(layerId);
    if (context.map.getSource(sourceId)) context.map.removeSource(sourceId);
    return false;
  }
}
