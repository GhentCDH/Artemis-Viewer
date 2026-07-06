import type { LayerInfo } from "$lib/artemis/iiif/bundleLoader";

// Hard-coded Allmaps mapOptions toggles.
//
// Allmaps lets you pass `mapOptions` into:
// - addGeoreferencedMap(georeferencedMap, mapOptions)
// - addGeoreferenceAnnotation(annotation, mapOptions)
//
// The expected type is `Partial<WebGL2WarpedMapOptions>` (from @allmaps/render).
// We mirror the full option surface here without importing @allmaps/render directly,
// since it's a transitive dependency and won't exist as a top-level node_modules entry
// in this pnpm workspace unless added explicitly.

// Mirrors `DistortionMeasure` from @allmaps/transform.
export type DistortionMeasure =
  | "log2sigma"
  | "twoOmega"
  | "airyKavr"
  | "signDetJ"
  | "thetaa";

export type AllmapsMapOptions = Partial<{
  // WebGL2WarpedMapOptions (render + debug)
  renderMaps: boolean;
  renderLines: boolean;
  renderPoints: boolean;

  renderGcps: boolean;
  renderGcpsColor: string;
  renderGcpsSize: number;
  renderGcpsBorderColor: string;
  renderGcpsBorderSize: number;

  renderTransformedGcps: boolean;
  renderTransformedGcpsColor: string;
  renderTransformedGcpsSize: number;
  renderTransformedGcpsBorderColor: string;
  renderTransformedGcpsBorderSize: number;

  renderVectors: boolean;
  renderVectorsColor: string;
  renderVectorsSize: number;
  renderVectorsBorderColor: string;
  renderVectorsBorderSize: number;

  renderFullMask: boolean;
  renderFullMaskColor: string;
  renderFullMaskSize: number;
  renderFullMaskBorderColor: string;
  renderFullMaskBorderSize: number;

  renderAppliedMask: boolean;
  renderAppliedMaskColor: string;
  renderAppliedMaskSize: number;
  renderAppliedMaskBorderColor: string;
  renderAppliedMaskBorderSize: number;

  renderMask: boolean;
  renderMaskColor: string;
  renderMaskSize: number;
  renderMaskBorderColor: string;
  renderMaskBorderSize: number;

  opacity: number;
  saturation: number;

  removeColor: boolean;
  removeColorColor: string;
  removeColorThreshold: number;
  removeColorHardness: number;

  colorize: boolean;
  colorizeColor: string;

  distortionColor00: string;
  distortionColor01: string;
  distortionColor1: string;
  distortionColor2: string;
  distortionColor3: string;

  renderGrid: boolean;
  renderGridColor: string;

  debugTriangles: boolean;
  debugTiles: boolean;

  // WarpedMap / triangulation pipeline options (non-primitive types kept as unknown)
  fetchFn: any;
  gcps: any;
  resourceMask: any;
  transformationType: any;
  internalProjection: any;
  projection: any;
  visible: boolean;
  anticipateVisibility: boolean;
  overviewTilesSelection: "highest" | "lowest";
  overviewTilesMaxResolution: number;
  applyMask: boolean;

  // The distortion measure to visualize for the map. NOTE: Allmaps only wires this
  // up through the option-*change* path (setDistortionMeasure → re-triangulate), which
  // never runs during addGeoreferencedMap()'s init. It must be applied via
  // WarpedMapLayer.setMapsOptions() AFTER the maps are added — see POST_ADD_ONLY_OPTION_KEYS.
  distortionMeasure: DistortionMeasure;

  resourceResolution: number;
  // Distortion measures computed during triangulation. Setting `distortionMeasure`
  // post-add pushes into this automatically, so it rarely needs to be set by hand.
  distortionMeasures: DistortionMeasure[];
}>;

export type AllmapsDebugConfig = {
  enabled: boolean;
  defaults: AllmapsMapOptions;
  byIiifLayer: Record<string, AllmapsMapOptions>;
  byIiifLayerAndRenderKey: Record<string, AllmapsMapOptions>;
};

export const ALLMAPS_DEBUG_CONFIG: AllmapsDebugConfig = {
  enabled: true,

  // Applied to every IIIF map when enabled (unless overwritten below).
  defaults: {
    transformationType: "thinPlateSpline",
    // distortionMeasure: "log2sigma",
    debugTriangles: false,
    debugTiles: false,
  },

  // Main IIIF layer keys (usually `LayerInfo.map`, e.g. "PrimitiefKadaster").
  byIiifLayer: {
    // Example:
    // PrimitiefKadaster: { debugTriangles: true, debugTriangulation: true },
  },

  // Optional finer-grained overrides per render layer key.
  // Key format: `${iiifLayerKey}::${renderLayerKey}` (renderLayerKey defaults to "all").
  byIiifLayerAndRenderKey: {
    // Example:
    // "PrimitiefKadaster::verzamelblad": { debugTiles: true },
  },
};

function getIiifLayerKey(layerInfo: LayerInfo): string {
  const key = String(layerInfo.map ?? layerInfo.sourceCollectionLabel ?? "").trim();
  return key || "unknown";
}

export function getAllmapsDebugMapOptions(layerInfo: LayerInfo): AllmapsMapOptions | undefined {
  if (!ALLMAPS_DEBUG_CONFIG.enabled) return undefined;

  const iiifLayerKey = getIiifLayerKey(layerInfo);
  const renderKey = String(layerInfo.renderLayerKey ?? "all").trim() || "all";
  const perRenderKey = ALLMAPS_DEBUG_CONFIG.byIiifLayerAndRenderKey[`${iiifLayerKey}::${renderKey}`];
  const perLayer = ALLMAPS_DEBUG_CONFIG.byIiifLayer[iiifLayerKey];

  return {
    ...ALLMAPS_DEBUG_CONFIG.defaults,
    ...perLayer,
    ...perRenderKey,
  };
}

// Options that Allmaps ignores when passed to addGeoreferencedMap() and only honors
// via setMapsOptions() after a map is added. addGeoreferencedMap() runs applyOptions()
// with stage "init", which does NOT invoke the per-option setters (e.g.
// setDistortionMeasure); those only fire on the later option-*change* path. So
// distortionMeasure baked into the create-time options is a silent no-op.
export const POST_ADD_ONLY_OPTION_KEYS = ["distortionMeasure"] as const satisfies ReadonlyArray<
  keyof AllmapsMapOptions
>;

// Split resolved options into the ones safe to pass to addGeoreferencedMap() (`create`)
// and the ones that must be applied afterwards via setMapsOptions() (`afterAdd`).
export function partitionAllmapsMapOptions(options: AllmapsMapOptions): {
  create: AllmapsMapOptions;
  afterAdd: AllmapsMapOptions;
} {
  const create: AllmapsMapOptions = { ...options };
  const afterAdd: AllmapsMapOptions = {};
  for (const key of POST_ADD_ONLY_OPTION_KEYS) {
    if (options[key] === undefined) continue;
    (afterAdd as Record<string, unknown>)[key] = options[key];
    delete (create as Record<string, unknown>)[key];
  }
  return { create, afterAdd };
}
