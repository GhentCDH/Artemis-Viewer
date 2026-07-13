import type maplibregl from 'maplibre-gl';
import type { LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
import { removeGeoJsonLayers, renderGeoJsonLayers } from '$lib/core/renderers/geoJsonRenderer';
import { removeRasterLayer, renderRasterLayer } from '$lib/core/renderers/rasterRenderer';
import { readThemeColor } from './mapColors';

// Published extent of the current baselayer.pmtiles (Scheldt corridor, Ghent–Antwerp).
export const BASELAYER_BOUNDS: LngLatBoundsLike = [
  [3.73122, 50.898161],
  [4.6417529, 51.377167],
];

export interface BasemapOption {
  id: string;
  label: string;
  kind: 'artemis' | 'raster' | 'wfs';
  url: string | null;
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

export const BUILT_IN_BASEMAPS = [ARTEMIS_BASEMAP, OPENSTREETMAP_BASEMAP] as const;

const OSM_SOURCE_ID = 'background-openstreetmap';
const OSM_LAYER_ID = 'background-openstreetmap';
const CUSTOM_SOURCE_ID = 'background-custom';
const CUSTOM_RASTER_LAYER_ID = 'background-custom-raster';
const CUSTOM_GEOJSON_LAYER_PREFIX = 'background-custom';

const GRID_BOUNDS = {
  west: 1.5,
  south: 50.4,
  east: 7,
  north: 51.8,
};
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

function createGrid(): GeoJSON.FeatureCollection<GeoJSON.LineString, { scale: GridScale }> {
  const features: Array<GeoJSON.Feature<GeoJSON.LineString, { scale: GridScale }>> = [];
  const firstLongitude = Math.ceil(GRID_BOUNDS.west / GRID_STEP_LONGITUDE_DEGREES);
  const lastLongitude = Math.floor(GRID_BOUNDS.east / GRID_STEP_LONGITUDE_DEGREES);
  const firstMercatorY = Math.ceil(latitudeToMercatorY(GRID_BOUNDS.north) / GRID_STEP_MERCATOR);
  const lastMercatorY = Math.floor(latitudeToMercatorY(GRID_BOUNDS.south) / GRID_STEP_MERCATOR);

  for (let index = firstLongitude; index <= lastLongitude; index += 1) {
    const longitude = index * GRID_STEP_LONGITUDE_DEGREES;
    features.push({
      type: 'Feature',
      properties: { scale: gridScale(index) },
      geometry: {
        type: 'LineString',
        coordinates: [
          [longitude, GRID_BOUNDS.south],
          [longitude, GRID_BOUNDS.north],
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
          [GRID_BOUNDS.west, latitude],
          [GRID_BOUNDS.east, latitude],
        ],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function createBaselayerStyle(pmtilesUrl: string): StyleSpecification {
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
        data: createGrid(),
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
        id: 'background-grid-major',
        type: 'line',
        source: 'background-grid',
        filter: ['==', ['get', 'scale'], 'major'],
        paint: {
          'line-color': readThemeColor('--color-map-grid', '#757575'),
          'line-opacity': 0.12,
          'line-width': 1,
        },
      },
      {
        id: 'background-grid-minor',
        type: 'line',
        source: 'background-grid',
        minzoom: 9,
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
        minzoom: 12,
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
        'source-layer': 'baselayer',
        paint: {
          'fill-color': readThemeColor('--color-map-water', '#607d91'),
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
