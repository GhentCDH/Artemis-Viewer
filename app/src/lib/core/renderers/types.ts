import type maplibregl from 'maplibre-gl';
import type { LayerSublayer } from '$lib/core/dataset/layerRegistry';

export type AllmapsTransformation = 'thinPlateSpline' | 'polynomial1';

export interface AllmapsRenderOptions {
  transformationType: AllmapsTransformation;
  debugTriangles: boolean;
  showHighStretch: boolean;
}

export interface SublayerRenderContext {
  map: maplibregl.Map;
  paneId: string;
  datasetBaseUrl: string;
  allmapsOptions: AllmapsRenderOptions;
}

export interface SublayerRenderTarget {
  layerId: string;
  sublayer: LayerSublayer;
}
