import { loadSearchSources } from '$lib/core/dataset/layerRegistry';
import { datasetUrl } from '$lib/core/dataset/dataSource';
import type { SearchIndex, SheetResult, ToponymResult } from './searchTypes';

interface RawToponymItem {
  id?: unknown;
  text?: unknown;
  lon?: unknown;
  lat?: unknown;
}

interface RawSheetItem {
  id?: unknown;
  label?: unknown;
  manifestUrl?: unknown;
  lon?: unknown;
  lat?: unknown;
  bounds?: unknown;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toBounds(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isFiniteNumber)) return null;
  return value as [number, number, number, number];
}

async function loadToponyms(url: string, layerId: string, layerLabel: string): Promise<ToponymResult[]> {
  const data = (await fetchJson(url)) as { items?: RawToponymItem[] };
  const results: ToponymResult[] = [];
  (data.items ?? []).forEach((raw, index) => {
    if (typeof raw.text !== 'string' || !isFiniteNumber(raw.lon) || !isFiniteNumber(raw.lat)) return;
    results.push({
      kind: 'toponym',
      id: typeof raw.id === 'string' ? raw.id : `${layerId}::${index}`,
      text: raw.text,
      lon: raw.lon,
      lat: raw.lat,
      layerId,
      layerLabel,
    });
  });
  return results;
}

async function loadSheets(url: string, layerId: string, layerLabel: string): Promise<SheetResult[]> {
  const data = (await fetchJson(url)) as { items?: RawSheetItem[] };
  const results: SheetResult[] = [];
  (data.items ?? []).forEach((raw, index) => {
    if (typeof raw.label !== 'string' || typeof raw.manifestUrl !== 'string' || !isFiniteNumber(raw.lon) || !isFiniteNumber(raw.lat)) return;
    results.push({
      kind: 'sheet',
      id: typeof raw.id === 'string' ? raw.id : `${layerId}::${index}`,
      label: raw.label,
      manifestUrl: raw.manifestUrl,
      lon: raw.lon,
      lat: raw.lat,
      bounds: toBounds(raw.bounds),
      // The result's own layerId identifies the *sublayer* the sheet came from (e.g. a
      // verzamelbladen sub-collection); the parent LayerSummary id passed in here is
      // what timelineSelection actually toggles.
      layerId,
      layerLabel,
    });
  });
  return results;
}

/**
 * Fetches every layer's toponym and sheet search artifacts in parallel. A failure on
 * one layer's artifact is non-fatal — it just contributes no results for that layer.
 */
export async function loadSearchIndex(layersUrl: string): Promise<SearchIndex> {
  const sources = await loadSearchSources(layersUrl);
  const toponyms: ToponymResult[] = [];
  const sheets: SheetResult[] = [];

  await Promise.all(
    sources.map(async (source) => {
      const fetches: Promise<void>[] = [];

      if (source.toponymsUrl) {
        fetches.push(
          loadToponyms(datasetUrl(source.toponymsUrl), source.layerId, source.label)
            .then((items) => void toponyms.push(...items))
            .catch(() => {})
        );
      }

      for (const sheetIndexUrl of source.sheetIndexUrls) {
        fetches.push(
          loadSheets(datasetUrl(sheetIndexUrl), source.layerId, source.label)
            .then((items) => void sheets.push(...items))
            .catch(() => {})
        );
      }

      await Promise.all(fetches);
    })
  );

  return { toponyms, sheets };
}
