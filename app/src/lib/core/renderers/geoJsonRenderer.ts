import type maplibregl from 'maplibre-gl';

export interface GeoJsonRenderOptions {
  sourceId: string;
  layerIdPrefix: string;
  dataUrl: string;
  beforeId?: string;
  fillColor: string;
  lineColor: string;
  pointColor: string;
}

export function geoJsonLayerIds(prefix: string): string[] {
  return [`${prefix}-fill`, `${prefix}-line`, `${prefix}-point`];
}

export function renderGeoJsonLayers(map: maplibregl.Map, options: GeoJsonRenderOptions): void {
  if (!map.getSource(options.sourceId)) {
    map.addSource(options.sourceId, { type: 'geojson', data: options.dataUrl });
  }

  const [fillLayerId, lineLayerId, pointLayerId] = geoJsonLayerIds(options.layerIdPrefix);
  if (!map.getLayer(fillLayerId)) {
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: options.sourceId,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': options.fillColor, 'fill-opacity': 0.24 },
    }, options.beforeId);
  }
  if (!map.getLayer(lineLayerId)) {
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: options.sourceId,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
      paint: { 'line-color': options.lineColor, 'line-width': 1 },
    }, options.beforeId);
  }
  if (!map.getLayer(pointLayerId)) {
    map.addLayer({
      id: pointLayerId,
      type: 'circle',
      source: options.sourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': options.pointColor, 'circle-radius': 3 },
    }, options.beforeId);
  }
}

export function removeGeoJsonLayers(map: maplibregl.Map, sourceId: string, layerIdPrefix: string): void {
  for (const layerId of geoJsonLayerIds(layerIdPrefix).reverse()) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}
