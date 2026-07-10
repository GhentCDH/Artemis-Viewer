import { parse } from 'yaml';

export interface LayerSublayer {
  id: string;
  name: string;
  kind: string;
  description: string;
  downloadFile: string;
  downloadUrl: string;
  source: LayerSublayerSource | null;
  artifacts: Record<string, string>;
}

export interface LayerSummary {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  sublayers: LayerSublayer[];
}

export interface LayerSublayerSource {
  type: string;
  url?: string;
}

interface LayersYamlDocument {
  layers: Array<{
    id: string;
    label: string;
    timeframe: { startYear: number; endYear: number };
    sublayers?: Array<{
      id: string;
      name: string;
      kind: string;
      description?: string;
      disabled?: boolean;
      source?: LayerSublayerSource;
      artifacts?: Record<string, string>;
      download?: {
        file?: string;
        url?: string;
      };
    }>;
  }>;
}

export interface SearchSource {
  layerId: string;
  label: string;
  toponymsUrl: string | null;
  sheetIndexUrls: string[];
}

// Shared across loadLayerRegistry and loadSearchSources so opening the search menu
// after the app has already loaded the registry doesn't re-fetch layers.yaml.
const documentCache = new Map<string, Promise<LayersYamlDocument>>();

function fetchLayersDocument(layersUrl: string): Promise<LayersYamlDocument> {
  let pending = documentCache.get(layersUrl);
  if (!pending) {
    pending = fetch(layersUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch layer registry: ${response.status} ${layersUrl}`);
      }
      return parse(await response.text()) as LayersYamlDocument;
    });
    documentCache.set(layersUrl, pending);
    void pending.catch(() => documentCache.delete(layersUrl));
  }
  return pending;
}

export async function loadLayerRegistry(layersUrl: string): Promise<LayerSummary[]> {
  const doc = await fetchLayersDocument(layersUrl);
  return doc.layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    startYear: layer.timeframe.startYear,
    endYear: layer.timeframe.endYear,
    sublayers: (layer.sublayers ?? [])
      .filter((sublayer) => !sublayer.disabled && sublayer.kind !== 'searchable')
      .map((sublayer) => ({
        id: sublayer.id,
        name: sublayer.name,
        kind: sublayer.kind,
        description: sublayer.description?.trim() ?? '',
        downloadFile: sublayer.download?.file ?? '',
        downloadUrl: sublayer.download?.url ?? '',
        source: sublayer.source ?? null,
        artifacts: sublayer.artifacts ?? {},
      })),
  }));
}

/**
 * Search-relevant artifact URLs per layer, read from the sublayers loadLayerRegistry
 * deliberately excludes from the visual registry (`kind: 'searchable'` toponym
 * sublayers render nothing — they exist only to carry a toponyms.json path).
 */
export async function loadSearchSources(layersUrl: string): Promise<SearchSource[]> {
  const doc = await fetchLayersDocument(layersUrl);
  return doc.layers
    .map((layer) => {
      const activeSublayers = (layer.sublayers ?? []).filter((sublayer) => !sublayer.disabled);
      const toponymsUrl = activeSublayers.find((sublayer) => sublayer.kind === 'searchable')?.artifacts?.toponyms ?? null;
      const sheetIndexUrls = activeSublayers
        .map((sublayer) => sublayer.artifacts?.search)
        .filter((url): url is string => Boolean(url));

      return {
        layerId: layer.id,
        label: layer.label,
        toponymsUrl,
        sheetIndexUrls,
      };
    })
    .filter((source) => source.toponymsUrl !== null || source.sheetIndexUrls.length > 0);
}
