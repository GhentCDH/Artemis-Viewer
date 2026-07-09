import type maplibregl from 'maplibre-gl';
import type { LayerSublayer } from '$lib/core/dataset/layerRegistry';

export interface SublayerRenderContext {
  map: maplibregl.Map;
  paneId: string;
  datasetBaseUrl: string;
}

export interface SublayerRenderTarget {
  layerId: string;
  sublayer: LayerSublayer;
}
