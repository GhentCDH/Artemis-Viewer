import type { ManifestSearchItem } from '$lib/artemis/shared/types';
import type { CompiledIndex } from '$lib/artemis/iiif/layerController';
import type { LayerArtifactRef } from '$lib/artemis/dataset/datasetV2';
import { joinUrl } from '$lib/artemis/shared/utils';

type VisibleLayer = {
  sourceCollectionUrl: string;
  sourceCollectionLabel: string;
  map?: string;
};

type BuildManifestSearchIndexOptions = {
  index: CompiledIndex;
  visibleLayers: VisibleLayer[];
  cleanLayerLabel: (label: string) => string;
  normalizeSearchText: (text: string) => string;
  asFiniteNumber: (value: unknown) => number | null;
};

export function buildManifestSearchIndex({
  index,
  visibleLayers,
  cleanLayerLabel,
  normalizeSearchText,
  asFiniteNumber,
}: BuildManifestSearchIndexOptions): ManifestSearchItem[] {
  const sourceLabelByUrl = new Map<string, string>();
  const mapIdByUrl = new Map<string, string>();
  for (const layer of visibleLayers) {
    const label = cleanLayerLabel(layer.sourceCollectionLabel || '');
    if (label && !sourceLabelByUrl.has(layer.sourceCollectionUrl)) {
      sourceLabelByUrl.set(layer.sourceCollectionUrl, label);
    }
    if (layer.map && !mapIdByUrl.has(layer.sourceCollectionUrl)) {
      mapIdByUrl.set(layer.sourceCollectionUrl, layer.map);
    }
  }

  const out: ManifestSearchItem[] = [];
  const seen = new Set<string>();
  for (const entry of index.index ?? []) {
    const label = String(entry.label ?? '').trim();
    if (!label) continue;
    const sourceManifestUrl = String(entry.sourceManifestUrl ?? '').trim();
    const compiledManifestPath = String(entry.compiledManifestPath ?? '').trim();
    if (!sourceManifestUrl || !compiledManifestPath) continue;

    const lon = asFiniteNumber((entry as any).centerLon);
    const lat = asFiniteNumber((entry as any).centerLat);
    const mapId = mapIdByUrl.get(entry.sourceCollectionUrl) || '';
    const mapName =
      sourceLabelByUrl.get(entry.sourceCollectionUrl) ||
      (entry as any).sourceCollectionLabel ||
      'IIIF';
    const text = `${mapName} - ${label}`;
    const id = compiledManifestPath || sourceManifestUrl;
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      label,
      text,
      textNormalized: normalizeSearchText(text),
      mapId,
      mapName,
      sourceManifestUrl,
      compiledManifestPath,
      centerLon: lon ?? undefined,
      centerLat: lat ?? undefined,
    });
  }

  return out;
}

type BuildV2ManifestSearchOptions = {
  datasetBaseUrl: string;
  searchArtifacts: LayerArtifactRef[];
  normalizeSearchText: (text: string) => string;
  asFiniteNumber: (value: unknown) => number | null;
  fetchTimeoutMs?: number;
};

/**
 * Data-build-v2 IIIF map/sheet search: load each layer's `search.json` artifact and merge its
 * `items[]`. Each item is self-describing ({id, label, layerId, manifestUrl, lon/lat, bounds}); no
 * cross-referencing against a global index is needed. `bounds` (when present) drives a fit-bounds
 * fly-to, falling back to the `lon`/`lat` centre.
 */
export async function buildV2ManifestSearchIndex({
  datasetBaseUrl,
  searchArtifacts,
  normalizeSearchText,
  asFiniteNumber,
  fetchTimeoutMs = 30000,
}: BuildV2ManifestSearchOptions): Promise<ManifestSearchItem[]> {
  const out: ManifestSearchItem[] = [];
  const seen = new Set<string>();

  await Promise.all(
    searchArtifacts.map(async ({ layerId, label: layerLabel, path }) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
        let res: Response;
        try {
          res = await fetch(joinUrl(datasetBaseUrl, path), { redirect: 'follow', signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) return;
        const payload = await res.json();
        const mapName = String(payload?.layerLabel ?? layerLabel ?? layerId);
        for (const raw of Array.isArray(payload?.items) ? payload.items : []) {
          const manifestUrl = String(raw?.manifestUrl ?? '').trim();
          const itemLabel = String(raw?.label ?? '').trim();
          if (!manifestUrl || !itemLabel) continue;
          const id = String(raw?.id ?? manifestUrl);
          if (seen.has(id)) continue;
          seen.add(id);
          const text = `${mapName} - ${itemLabel}`;
          const bounds = Array.isArray(raw?.bounds) && raw.bounds.length === 4
            ? (raw.bounds.map(Number) as [number, number, number, number])
            : undefined;
          out.push({
            id,
            label: itemLabel,
            text,
            textNormalized: normalizeSearchText(text),
            mapId: String(raw?.layerId ?? layerId),
            mapName,
            sourceManifestUrl: manifestUrl,
            compiledManifestPath: manifestUrl,
            centerLon: asFiniteNumber(raw?.lon) ?? undefined,
            centerLat: asFiniteNumber(raw?.lat) ?? undefined,
            bounds,
          });
        }
      } catch {
        // per-layer failure is non-fatal — other layers still contribute
      }
    })
  );

  return out;
}
