import type maplibregl from 'maplibre-gl';

export interface RasterRenderOptions {
  sourceId: string;
  layerId: string;
  tileUrl: string;
  beforeId?: string;
  bounds?: [number, number, number, number];
  opacity?: number;
}

export function renderRasterLayer(map: maplibregl.Map, options: RasterRenderOptions): void {
  if (!map.getSource(options.sourceId)) {
    map.addSource(options.sourceId, {
      type: 'raster',
      tiles: [options.tileUrl],
      tileSize: 256,
      ...(options.bounds ? { bounds: options.bounds } : {}),
    });
  }

  if (!map.getLayer(options.layerId)) {
    map.addLayer({
      id: options.layerId,
      type: 'raster',
      source: options.sourceId,
      paint: { 'raster-opacity': options.opacity ?? 1 },
    }, options.beforeId);
  }
}

export function removeRasterLayer(map: maplibregl.Map, sourceId: string, layerId: string): void {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}
