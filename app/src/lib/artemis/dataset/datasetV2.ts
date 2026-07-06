// Data build v2 dual loader.
//
// The v2 pipeline publishes a layer-oriented, self-describing build tree rooted at
// `build/layers.yaml` (+ `build/imagecollection.yaml`) instead of the legacy stage-oriented
// `build/index.json`. This module resolves either shape into a single `NormalizedDataset` and,
// for v2, also emits a `CompiledIndex`-shaped bridge so the existing `normalizeSourceLayers()`
// / manifest-search / toponym code paths keep working unchanged.
//
// Detection is contract-driven, not config-driven: try `layers.yaml` → `v2-layers`; on 404 / parse
// failure fall back to `index.json` → `legacy-index`. Everything downstream gates off `DatasetMode`.

import { parse as parseYaml } from "yaml";
import { joinUrl } from "$lib/artemis/shared/utils";
import { loadCompiledIndex, type CompiledIndex, type CompiledRunnerConfig, type LayerInfo } from "$lib/artemis/iiif/bundleLoader";

export type DatasetMode = "legacy-index" | "v2-layers";

export type SubLayerKindV2 = "wmts" | "wms" | "iiif" | "geojson" | "searchable";
export type SubLayerSourceType = "remote" | "generated" | "planned";

export type NormalizedSubLayer = {
  id: string; // e.g. "GereduceerdeKadaster-iiif" (matches app sub-ids)
  name: string; // sublayer display name
  kind: SubLayerKindV2;
  sourceType: SubLayerSourceType;
  remoteUrl?: string; // wmts/wms/iiif source.url
  artifacts?: Record<string, string>; // role -> deploy-relative path under Layers/<LayerId>/
  disabled: boolean; // sourceType === "planned"
  description?: string;
};

export type LayerTimeframe = { startYear?: number; endYear?: number; label?: string };

export type NormalizedMainLayer = {
  id: string; // LayerId, also the MainLayerId
  label: string;
  timeframe?: LayerTimeframe;
  sublayers: NormalizedSubLayer[];
};

export type LayerArtifactRef = { layerId: string; label: string; path: string };

export type NormalizedImageCollection = {
  id: string;
  label: string;
  provider?: string;
  indexPath: string;
  spritesImagePath?: string;
  spritesIndexPath?: string;
};

export type NormalizedDataset = {
  mode: DatasetMode;
  datasetBaseUrl: string;
  layers: NormalizedMainLayer[];
  iiifLayers: LayerInfo[]; // fed to normalizeSourceLayers
  toponymArtifacts: LayerArtifactRef[];
  iiifSearchArtifacts: LayerArtifactRef[];
  parcelArtifacts: LayerArtifactRef[];
  imageCollections: NormalizedImageCollection[];
};

export type LoadDatasetResult =
  | { mode: "v2-layers"; dataset: NormalizedDataset; index: CompiledIndex }
  | { mode: "legacy-index"; dataset: null; index: CompiledIndex };

const readString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const readNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Fetch a registry document, preferring a `.json` sibling then falling back to a `.yaml` parse. */
async function fetchRegistry(datasetBaseUrl: string, stem: string, timeoutMs: number): Promise<any | null> {
  for (const candidate of [`${stem}.json`, `${stem}.yaml`]) {
    const url = joinUrl(datasetBaseUrl, candidate);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) continue;
      const text = await res.text();
      // `yaml.parse` also parses JSON, but keep the .json branch explicit for clarity/speed.
      return candidate.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizeTimeframe(raw: any): LayerTimeframe | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const startYear = readNumber(raw.startYear);
  const endYear = readNumber(raw.endYear);
  const label = readString(raw.label);
  if (startYear === undefined && endYear === undefined && label === undefined) return undefined;
  return { startYear, endYear, label };
}

function normalizeSubLayer(raw: any): NormalizedSubLayer | null {
  const id = readString(raw?.id);
  if (!id) return null;
  const sourceType = (readString(raw?.source?.type) ?? "planned") as SubLayerSourceType;
  const artifacts: Record<string, string> = {};
  if (raw?.artifacts && typeof raw.artifacts === "object") {
    for (const [role, path] of Object.entries(raw.artifacts)) {
      const p = readString(path);
      if (p) artifacts[role] = p;
    }
  }
  return {
    id,
    name: readString(raw?.name) ?? id,
    kind: (readString(raw?.kind) ?? "geojson") as SubLayerKindV2,
    sourceType,
    remoteUrl: readString(raw?.source?.url),
    artifacts: Object.keys(artifacts).length ? artifacts : undefined,
    disabled: sourceType === "planned",
    description: readString(raw?.description),
  };
}

/** Build the app `LayerInfo` for a live (non-planned) IIIF sublayer with a geomaps artifact. */
function iiifLayerInfo(main: NormalizedMainLayer, sub: NormalizedSubLayer): LayerInfo | null {
  const geomapsPath = sub.artifacts?.geomaps;
  if (!geomapsPath) return null; // planned / not-yet-generated IIIF layer
  return {
    sourceCollectionUrl: sub.remoteUrl ?? "",
    sourceCollectionLabel: main.label,
    map: main.id,
    geomapsPath,
    masksPath: sub.artifacts?.masks,
    rasterPmtilesPath: sub.artifacts?.raster,
    spritesImagePath: sub.artifacts?.sprites,
    spritesIndexPath: sub.artifacts?.spritesIndex,
    renderLayerKey: "default",
    renderLayerLabel: sub.name,
  };
}

function normalizeLayersRegistry(raw: any, datasetBaseUrl: string): NormalizedDataset {
  const layers: NormalizedMainLayer[] = [];
  const iiifLayers: LayerInfo[] = [];
  const toponymArtifacts: LayerArtifactRef[] = [];
  const iiifSearchArtifacts: LayerArtifactRef[] = [];
  const parcelArtifacts: LayerArtifactRef[] = [];

  for (const rawLayer of Array.isArray(raw?.layers) ? raw.layers : []) {
    const id = readString(rawLayer?.id);
    if (!id) continue;
    const main: NormalizedMainLayer = {
      id,
      label: readString(rawLayer?.label) ?? id,
      timeframe: normalizeTimeframe(rawLayer?.timeframe),
      sublayers: [],
    };
    for (const rawSub of Array.isArray(rawLayer?.sublayers) ? rawLayer.sublayers : []) {
      const sub = normalizeSubLayer(rawSub);
      if (!sub) continue;
      main.sublayers.push(sub);

      if (sub.kind === "iiif") {
        const info = iiifLayerInfo(main, sub);
        if (info) iiifLayers.push(info);
      }
      const topo = sub.artifacts?.toponyms;
      if (topo) toponymArtifacts.push({ layerId: id, label: main.label, path: topo });
      const search = sub.artifacts?.search;
      if (search) iiifSearchArtifacts.push({ layerId: id, label: main.label, path: search });
      const parcels = sub.artifacts?.parcels;
      if (parcels) parcelArtifacts.push({ layerId: id, label: main.label, path: parcels });
    }
    layers.push(main);
  }

  return {
    mode: "v2-layers",
    datasetBaseUrl,
    layers,
    iiifLayers,
    toponymArtifacts,
    iiifSearchArtifacts,
    parcelArtifacts,
    imageCollections: [],
  };
}

function normalizeImageCollections(raw: any): NormalizedImageCollection[] {
  const out: NormalizedImageCollection[] = [];
  for (const rawCol of Array.isArray(raw?.collections) ? raw.collections : []) {
    const id = readString(rawCol?.id);
    const indexPath = readString(rawCol?.artifacts?.index);
    if (!id || !indexPath) continue;
    out.push({
      id,
      label: readString(rawCol?.label) ?? id,
      provider: readString(rawCol?.provider),
      indexPath,
      spritesImagePath: readString(rawCol?.artifacts?.sprites),
      spritesIndexPath: readString(rawCol?.artifacts?.spritesIndex),
    });
  }
  return out;
}

/**
 * Build a `CompiledIndex`-shaped bridge from a v2 dataset so existing consumers
 * (`normalizeSourceLayers`, manifest search, etc.) keep working. `index` is intentionally
 * empty — v2 search comes from per-layer `search.json` artifacts, not this array.
 */
function toBridgeIndex(dataset: NormalizedDataset): CompiledIndex {
  return {
    iiifLayers: dataset.iiifLayers,
    index: [],
  };
}

/**
 * Resolve a dataset root into a normalized model. Tries v2 (`layers.yaml`) first, then falls back
 * to the legacy `index.json`. `loadImageCollections` is only honored in v2 mode.
 */
export async function loadNormalizedDataset(
  cfg: CompiledRunnerConfig,
  opts: { loadImageCollections?: boolean } = {}
): Promise<LoadDatasetResult> {
  const timeout = cfg.fetchTimeoutMs ?? 30000;
  const datasetBaseUrl = cfg.datasetBaseUrl.replace(/\/+$/, "");

  const layersRaw = await fetchRegistry(datasetBaseUrl, "layers", timeout);
  if (layersRaw && Array.isArray(layersRaw.layers)) {
    const dataset = normalizeLayersRegistry(layersRaw, datasetBaseUrl);
    if (opts.loadImageCollections !== false) {
      const collectionsRaw = await fetchRegistry(datasetBaseUrl, "imagecollection", timeout);
      if (collectionsRaw) dataset.imageCollections = normalizeImageCollections(collectionsRaw);
    }
    return { mode: "v2-layers", dataset, index: toBridgeIndex(dataset) };
  }

  // Legacy fallback.
  const index = await loadCompiledIndex(cfg);
  return { mode: "legacy-index", dataset: null, index };
}
