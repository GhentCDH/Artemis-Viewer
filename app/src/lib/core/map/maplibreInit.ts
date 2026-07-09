import maplibregl from 'maplibre-gl';
import type { LngLatBoundsLike } from 'maplibre-gl';
import { registerMapProtocols } from './protocols';
import { createBaselayerStyle } from './basemap';

export type PaneId = 'left' | 'right';

export interface MapLibreInitOptions {
  container: HTMLElement;
  pmtilesUrl: string;
  initialBounds: LngLatBoundsLike;
  panBounds?: LngLatBoundsLike;
}

export interface MapLibreInstance {
  paneId: PaneId;
  map: maplibregl.Map;
  destroy: () => void;
}

const BELGIUM_BOUNDS = [
  [2.53, 50.685],
  [5.92, 51.52],
] as const;

function expandBounds(
  [[west, south], [east, north]]: typeof BELGIUM_BOUNDS,
  paddingRatio: number
): LngLatBoundsLike {
  const longitudePadding = (east - west) * paddingRatio;
  const latitudePadding = (north - south) * paddingRatio;
  return [
    [west - longitudePadding, south - latitudePadding],
    [east + longitudePadding, north + latitudePadding],
  ];
}

export const DEFAULT_MAPLIBRE_PAN_BOUNDS: LngLatBoundsLike = expandBounds(BELGIUM_BOUNDS, 0.3);

export function initializeMapLibre(paneId: PaneId, options: MapLibreInitOptions): MapLibreInstance {
  registerMapProtocols();

  const map = new maplibregl.Map({
    container: options.container,
    style: createBaselayerStyle(options.pmtilesUrl),
    bounds: options.initialBounds,
    maxBounds: options.panBounds ?? DEFAULT_MAPLIBRE_PAN_BOUNDS,
    fitBoundsOptions: { padding: 24 },
  });

  return {
    paneId,
    map,
    destroy: () => map.remove(),
  };
}
