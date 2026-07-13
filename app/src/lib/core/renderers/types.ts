import type maplibregl from 'maplibre-gl';
import type { LayerSublayer } from '$lib/core/dataset/layerRegistry';

export type AllmapsTransformation = 'thinPlateSpline' | 'polynomial1';
export type IiifLoadingMode = 'sequential' | 'eager';
export type AllmapsOverviewTilesSelection = 'highest' | 'lowest';

/**
 * WarpedMapLayer constructor tuning knobs (see allmapsWarpRenderer for what each one
 * trades off). Constructor-time only: changing any of these requires rebuilding the layer.
 */
export interface AllmapsTuningOptions {
  log2ScaleFactorCorrection: number;
  pruneViewportBufferRatio: number;
  overviewRequestViewportBufferRatio: number;
  overviewPruneViewportBufferRatio: number;
  maxTotalOverviewResolutionRatio: number;
  /** Per-map cap on overview-tile resolution; undefined lets Allmaps derive it from the ratio above. */
  overviewTilesMaxResolution: number | undefined;
  overviewTilesSelection: AllmapsOverviewTilesSelection;
}

export interface AllmapsRenderOptions {
  transformationType: AllmapsTransformation;
  debugTriangles: boolean;
  showHighStretch: boolean;
  loadingMode: IiifLoadingMode;
  diagnostics: boolean;
  /** When false, no sprite atlas is uploaded — every canvas fetches full-res IIIF tiles directly. */
  spritesEnabled: boolean;
  tuning: AllmapsTuningOptions;
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
