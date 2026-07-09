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

export async function loadLayerRegistry(layersUrl: string): Promise<LayerSummary[]> {
  const response = await fetch(layersUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch layer registry: ${response.status} ${layersUrl}`);
  }
  const doc = parse(await response.text()) as LayersYamlDocument;
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
