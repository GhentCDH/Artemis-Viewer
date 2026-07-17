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
  /** Tints sampled IIIF tiles blue and outlines their boundaries using Allmaps' debug shader. */
  debugTiles: boolean;
  showHighStretch: boolean;
  loadingMode: IiifLoadingMode;
  diagnostics: boolean;
  /** Logs Allmaps tile-cache size and in-viewport tile counts to the console (iiifAllmapsTileCacheLog). */
  tileCacheLog: boolean;
  /** Logs per-map GPU texture-array residency to the console (iiifAllmapsGpuLogs). */
  textureLog: boolean;
  /** Logs live PBO staging-buffer residency and upload churn to the console (iiifAllmapsGpuLogs). */
  pboLog: boolean;
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
