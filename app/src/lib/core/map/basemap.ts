import type { LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
import { readThemeColor } from './mapColors';

// Published extent of the current baselayer.pmtiles (Scheldt corridor, Ghent–Antwerp).
export const BASELAYER_BOUNDS: LngLatBoundsLike = [
  [3.73122, 50.898161],
  [4.6417529, 51.377167],
];

export function createBaselayerStyle(pmtilesUrl: string): StyleSpecification {
  return {
    version: 8,
    name: 'baselayer',
    sources: {
      baselayer: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
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
