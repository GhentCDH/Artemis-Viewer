import type maplibregl from 'maplibre-gl';
import type { LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
import { geoJsonLayerIds, removeGeoJsonLayers, renderGeoJsonLayers } from '$lib/core/renderers/geoJsonRenderer';
import { removeRasterLayer, renderRasterLayer } from '$lib/core/renderers/rasterRenderer';
import { isIiifLayerRole } from '$lib/core/renderers/iiif/iiifLayerRuntime';
import { readThemeColor, readThemeNumber } from './mapColors';
import { DEFAULT_MAPLIBRE_PAN_BOUNDS } from './mapBounds';

// Published extent of the current baselayer.pmtiles (Scheldt corridor, Ghent–Antwerp).
export const BASELAYER_BOUNDS: LngLatBoundsLike = [
  [3.73122, 50.898161],
  [4.6417529, 51.377167],
];

export interface BasemapOption {
  id: string;
  label: string;
  longLabel?: string;
  kind: 'artemis' | 'raster' | 'wfs';
  url: string | null;
}

export interface OverlayOption {
  id: string;
  label: string;
  longLabel?: string;
  kind: 'raster' | 'wfs';
  url: string;
  query?: OverlayQueryCapability;
}

export type OverlayQueryCapability =
  | { status: 'supported'; strategy: 'vector'; error?: string }
  | { status: 'supported'; strategy: 'wms-get-feature-info'; infoFormat: string; error?: string }
  | { status: 'unsupported' | 'unavailable' | 'error'; reason: string };

export interface OverlayFeatureInfo {
  title: string;
  properties: Record<string, unknown>;
}

export const ARTEMIS_BASEMAP: BasemapOption = {
  id: 'artemis',
  label: 'Scheldt map',
  kind: 'artemis',
  url: null,
};

export const OPENSTREETMAP_BASEMAP: BasemapOption = {
  id: 'openstreetmap',
  label: 'OpenStreetMap',
  kind: 'raster',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

// The project basemap is the only hardcoded choice. Other shipped services,
// including OpenStreetMap, come from the dataset's map-services.yaml.
export const BUILT_IN_BASEMAPS = [ARTEMIS_BASEMAP] as const;

const OSM_SOURCE_ID = 'background-openstreetmap';
const OSM_LAYER_ID = 'background-openstreetmap';

const CUSTOM_SOURCE_ID = 'background-custom';
const CUSTOM_RASTER_LAYER_ID = 'background-custom-raster';
const CUSTOM_GEOJSON_LAYER_PREFIX = 'background-custom';
const OVERLAY_SOURCE_ID = 'overlay-custom';
const OVERLAY_RASTER_LAYER_ID = 'overlay-custom-raster';
const OVERLAY_GEOJSON_LAYER_PREFIX = 'overlay-custom';
// Matches the base fill-opacity geoJsonRenderer assigns, so an overlay opacity
// of 1 renders a GeoJSON overlay exactly like a GeoJSON basemap.
const OVERLAY_GEOJSON_FILL_OPACITY = 0.24;

export function customOverlayLayerIds(): string[] {
  return [OVERLAY_RASTER_LAYER_ID, ...geoJsonLayerIds(OVERLAY_GEOJSON_LAYER_PREFIX)];
}

const GRID_STEP_LONGITUDE_DEGREES = 0.005;
const GRID_STEP_MERCATOR = GRID_STEP_LONGITUDE_DEGREES / 360;

type GridScale = 'major' | 'minor' | 'micro';

function gridScale(index: number): GridScale {
  if (index % 20 === 0) return 'major';
  if (index % 4 === 0) return 'minor';
  return 'micro';
}

function latitudeToMercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

function mercatorYToLatitude(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

function createGrid(
  [[west, south], [east, north]]: [[number, number], [number, number]]
): GeoJSON.FeatureCollection<GeoJSON.LineString, { scale: GridScale }> {
  const features: Array<GeoJSON.Feature<GeoJSON.LineString, { scale: GridScale }>> = [];
  const firstLongitude = Math.ceil(west / GRID_STEP_LONGITUDE_DEGREES);
  const lastLongitude = Math.floor(east / GRID_STEP_LONGITUDE_DEGREES);
  const firstMercatorY = Math.ceil(latitudeToMercatorY(north) / GRID_STEP_MERCATOR);
  const lastMercatorY = Math.floor(latitudeToMercatorY(south) / GRID_STEP_MERCATOR);

  for (let index = firstLongitude; index <= lastLongitude; index += 1) {
    const longitude = index * GRID_STEP_LONGITUDE_DEGREES;
    features.push({
      type: 'Feature',
      properties: { scale: gridScale(index) },
      geometry: {
        type: 'LineString',
        coordinates: [
          [longitude, south],
          [longitude, north],
        ],
      },
    });
  }

  for (let index = firstMercatorY; index <= lastMercatorY; index += 1) {
    const latitude = mercatorYToLatitude(index * GRID_STEP_MERCATOR);
    features.push({
      type: 'Feature',
      properties: { scale: gridScale(index) },
      geometry: {
        type: 'LineString',
        coordinates: [
          [west, latitude],
          [east, latitude],
        ],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function createBaselayerStyle(
  pmtilesUrl: string,
  gridBounds: [[number, number], [number, number]] = DEFAULT_MAPLIBRE_PAN_BOUNDS
): StyleSpecification {
  return {
    version: 8,
    name: 'baselayer',
    sources: {
      baselayer: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
      },
      'background-grid': {
        type: 'geojson',
        data: createGrid(gridBounds),
      },
      [OSM_SOURCE_ID]: {
        type: 'raster',
        tiles: [OPENSTREETMAP_BASEMAP.url!],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': readThemeColor('--color-map-background', '#f8f5ed'),
        },
      },
      {
        id: OSM_LAYER_ID,
        type: 'raster',
        source: OSM_SOURCE_ID,
        layout: { visibility: 'none' },
      },
      {
        id: 'baselayer-border',
        type: 'fill',
        source: 'baselayer',
        'source-layer': 'border',
        paint: {
          'fill-color': readThemeColor('--color-map-border', '#e6dfcf'),
          'fill-opacity': readThemeNumber('--opacity-map-border', 0.45),
        },
      },
      {
        id: 'background-grid-major',
        type: 'line',
        source: 'background-grid',
        filter: ['==', ['get', 'scale'], 'major'],
        paint: {
          'line-color': readThemeColor('--color-map-grid', '#757575'),
          'line-opacity': 0.18,
          'line-width': 1,
        },
      },
      {
        id: 'background-grid-minor',
        type: 'line',
        source: 'background-grid',
        filter: ['==', ['get', 'scale'], 'minor'],
        paint: {
          'line-color': readThemeColor('--color-map-grid', '#757575'),
          'line-opacity': 0.09,
          'line-width': 1,
        },
      },
      {
        id: 'background-grid-micro',
        type: 'line',
        source: 'background-grid',
        filter: ['==', ['get', 'scale'], 'micro'],
        paint: {
          'line-color': readThemeColor('--color-map-grid', '#757575'),
          'line-opacity': 0.07,
          'line-width': 1,
        },
      },
      {
        id: 'baselayer-water',
        type: 'fill',
        source: 'baselayer',
        'source-layer': 'water',
        paint: {
          'fill-color': readThemeColor('--color-map-water', '#607d91'),
          'fill-opacity': 1,
        },
      },
    ],
  };
}

function setLayerVisibility(map: maplibregl.Map, layerId: string, visible: boolean): void {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }
}

export function applyBasemap(map: maplibregl.Map, basemap: BasemapOption): void {
  // `isStyleLoaded()` transiently returns false while IIIF sources stream. The
  // base style is safe to edit as soon as its background layer is registered.
  if (!map.getLayer('background')) return;

  if (map.getLayer(CUSTOM_RASTER_LAYER_ID)) {
    removeRasterLayer(map, CUSTOM_SOURCE_ID, CUSTOM_RASTER_LAYER_ID);
  } else if (map.getSource(CUSTOM_SOURCE_ID)) {
    removeGeoJsonLayers(map, CUSTOM_SOURCE_ID, CUSTOM_GEOJSON_LAYER_PREFIX);
  }

  const isArtemis = basemap.id === ARTEMIS_BASEMAP.id;
  const isOpenStreetMap = basemap.id === OPENSTREETMAP_BASEMAP.id;
  setLayerVisibility(map, OSM_LAYER_ID, isOpenStreetMap);
  setLayerVisibility(map, 'background-grid-major', isArtemis);
  setLayerVisibility(map, 'background-grid-minor', isArtemis);
  setLayerVisibility(map, 'background-grid-micro', isArtemis);
  setLayerVisibility(map, 'baselayer-border', isArtemis);
  setLayerVisibility(map, 'baselayer-water', isArtemis);

  if (!isArtemis && !isOpenStreetMap && basemap.url && basemap.kind === 'raster') {
    renderRasterLayer(map, {
      sourceId: CUSTOM_SOURCE_ID,
      layerId: CUSTOM_RASTER_LAYER_ID,
      tileUrl: basemap.url,
      beforeId: 'background-grid-major',
    });
  }

  if (!isArtemis && basemap.url && basemap.kind === 'wfs') {
    renderGeoJsonLayers(map, {
      sourceId: CUSTOM_SOURCE_ID,
      layerIdPrefix: CUSTOM_GEOJSON_LAYER_PREFIX,
      dataUrl: basemap.url,
      beforeId: 'background-grid-major',
      fillColor: readThemeColor('--color-map-water', '#607d91'),
      lineColor: readThemeColor('--color-map-grid', '#757575'),
      pointColor: readThemeColor('--color-map-water', '#607d91'),
    });
  }
}

const appliedOverlayKeyByMap = new WeakMap<maplibregl.Map, string>();
// applyOverlay runs on every reconcile pass (styledata/idle). Map.setPaintProperty schedules a
// repaint even when the value is unchanged, which kept re-firing `idle` and made the reconcile
// cycle self-sustaining — so remember what was applied and skip the steady-state calls. Cleared
// in removeOverlay, since freshly created overlay layers start from their renderer defaults.
const appliedOverlayOpacityByMap = new WeakMap<maplibregl.Map, number>();

function setOverlayOpacity(map: maplibregl.Map, opacity: number): void {
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  if (appliedOverlayOpacityByMap.get(map) === safeOpacity) return;
  appliedOverlayOpacityByMap.set(map, safeOpacity);
  if (map.getLayer(OVERLAY_RASTER_LAYER_ID)) {
    map.setPaintProperty(OVERLAY_RASTER_LAYER_ID, 'raster-opacity', safeOpacity);
  }
  const [fillLayerId, lineLayerId, pointLayerId] = geoJsonLayerIds(OVERLAY_GEOJSON_LAYER_PREFIX);
  if (map.getLayer(fillLayerId)) {
    map.setPaintProperty(fillLayerId, 'fill-opacity', OVERLAY_GEOJSON_FILL_OPACITY * safeOpacity);
  }
  if (map.getLayer(lineLayerId)) map.setPaintProperty(lineLayerId, 'line-opacity', safeOpacity);
  if (map.getLayer(pointLayerId)) map.setPaintProperty(pointLayerId, 'circle-opacity', safeOpacity);
}

function removeOverlay(map: maplibregl.Map): void {
  if (map.getLayer(OVERLAY_RASTER_LAYER_ID)) {
    removeRasterLayer(map, OVERLAY_SOURCE_ID, OVERLAY_RASTER_LAYER_ID);
  } else if (map.getSource(OVERLAY_SOURCE_ID)) {
    removeGeoJsonLayers(map, OVERLAY_SOURCE_ID, OVERLAY_GEOJSON_LAYER_PREFIX);
  }
  appliedOverlayKeyByMap.delete(map);
  appliedOverlayOpacityByMap.delete(map);
}

function moveOverlayToTop(map: maplibregl.Map): void {
  const layerIds = map.getLayer(OVERLAY_RASTER_LAYER_ID)
    ? [OVERLAY_RASTER_LAYER_ID]
    : geoJsonLayerIds(OVERLAY_GEOJSON_LAYER_PREFIX);
  const existingLayerIds = layerIds.filter((layerId) => map.getLayer(layerId));
  const styleLayers = map.getStyle()?.layers ?? [];
  const lastOverlayIndex = Math.max(...existingLayerIds.map((layerId) =>
    styleLayers.findIndex((layer) => layer.id === layerId)
  ));
  const allowedAboveOverlay = (layerId: string) =>
    layerId === 'artemis-image-collection-pins' || isIiifLayerRole(layerId, 'mask-outline');
  const obstructingLayer = styleLayers
    .slice(lastOverlayIndex + 1)
    .find((layer) => !allowedAboveOverlay(layer.id));
  if (!obstructingLayer) return;

  const firstInteractionLayer = styleLayers.find((layer) => allowedAboveOverlay(layer.id));
  for (const layerId of existingLayerIds) map.moveLayer(layerId, firstInteractionLayer?.id);
}

export function applyOverlay(map: maplibregl.Map, overlay: OverlayOption | null, opacity: number): void {
  // Same readiness gate as applyBasemap: editable once the base style is registered.
  if (!map.getLayer('background')) return;

  const overlayKey = overlay?.url ? `${overlay.kind}:${overlay.url}` : null;
  const appliedKey = appliedOverlayKeyByMap.get(map) ?? null;

  if (appliedKey !== null && appliedKey !== overlayKey) {
    removeOverlay(map);
  }

  if (!overlay || overlayKey === null) {
    if (map.getSource(OVERLAY_SOURCE_ID)) removeOverlay(map);
    return;
  }

  if (appliedOverlayKeyByMap.get(map) !== overlayKey || !map.getSource(OVERLAY_SOURCE_ID)) {
    if (overlay.kind === 'raster') {
      renderRasterLayer(map, {
        sourceId: OVERLAY_SOURCE_ID,
        layerId: OVERLAY_RASTER_LAYER_ID,
        tileUrl: overlay.url,
      });
    } else {
      renderGeoJsonLayers(map, {
        sourceId: OVERLAY_SOURCE_ID,
        layerIdPrefix: OVERLAY_GEOJSON_LAYER_PREFIX,
        dataUrl: overlay.url,
        fillColor: readThemeColor('--color-accent', '#3f789f'),
        lineColor: readThemeColor('--color-accent', '#3f789f'),
        pointColor: readThemeColor('--color-accent', '#3f789f'),
      });
    }
    appliedOverlayKeyByMap.set(map, overlayKey);
  }

  setOverlayOpacity(map, opacity);
  moveOverlayToTop(map);
}
