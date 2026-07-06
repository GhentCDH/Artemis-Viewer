import type { CompiledIndex } from '$lib/artemis/iiif/layerController';
import type { RawToponymIndexItem, ToponymIndexItem } from '$lib/artemis/shared/types';
import type { LayerArtifactRef } from '$lib/artemis/dataset/datasetV2';
import { joinUrl } from '$lib/artemis/shared/utils';

type ToponymIndexPayload = {
  itemCount?: number;
  mapLabel?: string;
  items?: RawToponymIndexItem[];
  features?: Array<{ id?: string | number; properties?: Record<string, unknown>; geometry?: unknown }>;
};

type LoadToponymIndexDataOptions = {
  buildIndex: CompiledIndex;
  datasetBaseUrl: string;
  normalizeRawToponym: (raw: RawToponymIndexItem) => ToponymIndexItem | null;
  log?: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void;
  // Data-build-v2: explicit toponym artifacts from `layers.yaml`. When provided, these are loaded
  // directly (one `toponyms.json` per layer) instead of deriving map ids from `index.json.domains`.
  toponymArtifacts?: LayerArtifactRef[];
};

/** Normalize a toponym payload (either `{items:[…]}` or a GeoJSON `{features:[…]}`) into raw items. */
function extractToponymItems(
  json: ToponymIndexPayload,
  mapId: string,
  mapLabel: string,
  sourceFile: string
): RawToponymIndexItem[] {
  const items: RawToponymIndexItem[] = Array.isArray(json.items)
    ? json.items
    : Array.isArray(json.features)
      ? json.features.map((f, i) => {
          const p = (f?.properties ?? {}) as Record<string, unknown>;
          return {
            id: typeof f?.id === 'string' ? f.id : undefined,
            text: typeof p.text === 'string' ? p.text : undefined,
            textNormalized: typeof p.textNormalized === 'string' ? p.textNormalized : undefined,
            sourceGroup: typeof p.sourceGroup === 'string' ? p.sourceGroup : mapId,
            sourceFile: typeof p.sourceFile === 'string' ? p.sourceFile : sourceFile,
            mapId: typeof p.mapId === 'string' ? p.mapId : mapId,
            mapName: typeof p.mapName === 'string' ? p.mapName : mapLabel,
            featureIndex: Number.isFinite(p.featureIndex) ? Number(p.featureIndex) : i,
            lon: typeof p.lon === 'number' ? p.lon : undefined,
            lat: typeof p.lat === 'number' ? p.lat : undefined,
            centroid: Array.isArray(p.centroid) ? (p.centroid as [number, number]) : undefined,
            bounds: Array.isArray(p.bounds) ? (p.bounds as [number, number, number, number]) : undefined,
            geometry: f?.geometry,
          } as RawToponymIndexItem;
        })
      : [];

  return items.map((item, i) => ({
    ...item,
    id: `${mapId}::${i}`,
    mapId: item.mapId || mapId,
    sourceFile: item.sourceFile || sourceFile,
    sourceGroup: item.sourceGroup || mapId,
    mapName: item.mapName || mapLabel,
  }));
}

type LoadToponymIndexOptions = LoadToponymIndexDataOptions & {
  setToponymIndex: (items: ToponymIndexItem[]) => void;
  setToponymError: (error: string | null) => void;
  setToponymLoading: (loading: boolean) => void;
};

const FALLBACK_TOPONYM_MAPS = ['Ferraris', 'PrimitiefKadaster'];

export async function loadToponymIndexData({
  buildIndex,
  datasetBaseUrl,
  normalizeRawToponym,
  log,
  toponymArtifacts,
}: LoadToponymIndexDataOptions): Promise<{
  toponymIndex: ToponymIndexItem[];
  toponymError: string | null;
}> {
  // ── Data-build-v2: explicit per-layer toponym artifacts ─────────────────────────────────────
  if (toponymArtifacts && toponymArtifacts.length > 0) {
    try {
      const allItems: RawToponymIndexItem[] = [];
      const loadedMaps: string[] = [];
      await Promise.all(
        toponymArtifacts.map(async ({ layerId, label, path }) => {
          try {
            const res = await fetch(joinUrl(datasetBaseUrl, path), { redirect: 'follow' });
            if (!res.ok) {
              log?.('INFO', `No toponyms available for ${layerId} (${res.status})`);
              return;
            }
            const json = (await res.json()) as ToponymIndexPayload;
            const mapLabel = typeof json.mapLabel === 'string' ? json.mapLabel : label;
            const items = extractToponymItems(json, layerId, mapLabel, path);
            if (items.length > 0) {
              allItems.push(...items);
              loadedMaps.push(layerId);
              log?.('INFO', `Toponyms loaded for ${layerId}: ${items.length} items`);
            }
          } catch (err) {
            log?.('INFO', `Failed to load toponyms for ${layerId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        })
      );
      const toponymIndex = allItems.map((item) => normalizeRawToponym(item)).filter((x): x is ToponymIndexItem => !!x);
      log?.('INFO', `Total toponyms loaded: ${toponymIndex.length} items from maps: ${loadedMaps.join(', ')}`);
      return { toponymIndex, toponymError: null };
    } catch (e: any) {
      return { toponymIndex: [], toponymError: e?.message ?? String(e) };
    }
  }

  try {
    const domains = buildIndex.domains as any;
    const explicitToponymMaps = Array.isArray(domains?.toponyms?.maps) ? domains.toponyms.maps : [];
    const knownMaps = explicitToponymMaps.length > 0 ? explicitToponymMaps : FALLBACK_TOPONYM_MAPS;

    if (!knownMaps || knownMaps.length === 0) {
      log?.('WARN', 'No toponym maps found in build/index.json domains');
      return { toponymIndex: [], toponymError: null };
    }

    const allItems: RawToponymIndexItem[] = [];
    const loadedMaps: string[] = [];

    for (const mapId of knownMaps) {
      try {
        const url = `${datasetBaseUrl}/Toponyms/${mapId}/${mapId}Toponyms.json`;
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) {
          log?.('INFO', `No toponyms available for ${mapId} (${res.status})`);
          continue;
        }

        const json = (await res.json()) as ToponymIndexPayload;
        const mapLabel = typeof json.mapLabel === 'string' ? json.mapLabel : mapId;

        const items: RawToponymIndexItem[] = Array.isArray(json.items)
          ? json.items
          : Array.isArray(json.features)
            ? json.features.map((f, i) => {
                const p = (f?.properties ?? {}) as Record<string, unknown>;
                return {
                  id: typeof f?.id === 'string' ? f.id : undefined,
                  text: typeof p.text === 'string' ? p.text : undefined,
                  textNormalized: typeof p.textNormalized === 'string' ? p.textNormalized : undefined,
                  sourceGroup: typeof p.sourceGroup === 'string' ? p.sourceGroup : mapId,
                  sourceFile: typeof p.sourceFile === 'string' ? p.sourceFile : `${mapId}/${mapId}Toponyms.json`,
                  mapId: typeof p.mapId === 'string' ? p.mapId : mapId,
                  mapName: typeof p.mapName === 'string' ? p.mapName : mapLabel,
                  featureIndex: Number.isFinite(p.featureIndex) ? Number(p.featureIndex) : i,
                  lon: typeof p.lon === 'number' ? p.lon : undefined,
                  lat: typeof p.lat === 'number' ? p.lat : undefined,
                  centroid: Array.isArray(p.centroid) ? (p.centroid as [number, number]) : undefined,
                  bounds: Array.isArray(p.bounds) ? (p.bounds as [number, number, number, number]) : undefined,
                  geometry: f?.geometry,
                } as RawToponymIndexItem;
              })
            : [];

        if (items.length > 0) {
          const itemsWithMetadata = items.map((item, i) => ({
            ...item,
            id: `${mapId}::${i}`,
            mapId: item.mapId || mapId,
            sourceFile: item.sourceFile || `${mapId}/${mapId}Toponyms.json`,
            sourceGroup: item.sourceGroup || mapId,
            mapName: item.mapName || mapLabel,
          }));
          allItems.push(...itemsWithMetadata);
          loadedMaps.push(mapId);
          log?.('INFO', `Toponyms loaded for ${mapId}: ${items.length} items`);
        }
      } catch (err) {
        log?.('INFO', `Failed to load toponyms for ${mapId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const toponymIndex = allItems
      .map((item) => normalizeRawToponym(item))
      .filter((x): x is ToponymIndexItem => !!x);

    if (toponymIndex.length === 0) {
      log?.('WARN', `Toponyms index unavailable: no items loaded from ${loadedMaps.length} maps`);
    } else {
      log?.('INFO', `Total toponyms loaded: ${toponymIndex.length} items from maps: ${loadedMaps.join(', ')}`);
    }

    return { toponymIndex, toponymError: null };
  } catch (e: any) {
    return {
      toponymIndex: [],
      toponymError: e?.message ?? String(e),
    };
  }
}

export async function loadToponymIndex({
  buildIndex,
  datasetBaseUrl,
  normalizeRawToponym,
  log,
  toponymArtifacts,
  setToponymIndex,
  setToponymError,
  setToponymLoading,
}: LoadToponymIndexOptions): Promise<void> {
  setToponymLoading(true);
  setToponymError(null);

  try {
    const result = await loadToponymIndexData({
      buildIndex,
      datasetBaseUrl,
      normalizeRawToponym,
      log,
      toponymArtifacts,
    });
    setToponymIndex(result.toponymIndex);
    setToponymError(result.toponymError);
    if (result.toponymError) {
      log?.('WARN', `Toponyms index unavailable: ${result.toponymError}`);
    }
  } catch (e: any) {
    const message = e?.message ?? String(e);
    setToponymIndex([]);
    setToponymError(message);
    log?.('WARN', `Toponyms index unavailable: ${message}`);
  } finally {
    setToponymLoading(false);
  }
}
