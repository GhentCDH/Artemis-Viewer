import { loadSearchSources } from '$lib/core/dataset/layerRegistry';
import { datasetUrl } from '$lib/core/dataset/dataSource';
import { parse } from 'yaml';
import type { ImageResult, ImageSprite, SearchIndex, SheetResult, ToponymResult } from './searchTypes';

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

interface RawImageItem {
  id?: unknown;
  title?: unknown;
  year?: unknown;
  location?: unknown;
  manifestUrl?: unknown;
  lon?: unknown;
  lat?: unknown;
}

interface ImageCollectionRegistry {
  collections?: Array<{
    id?: unknown;
    label?: unknown;
    artifacts?: { index?: unknown; sprites?: unknown; spritesIndex?: unknown };
  }>;
}

interface RawSprite {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
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

async function loadImages(
  url: string,
  collectionId: string,
  collectionLabel: string,
  spritesImagePath?: string,
  spritesIndexPath?: string
): Promise<ImageResult[]> {
  const [data, rawSprites] = await Promise.all([
    fetchJson(url) as Promise<{ items?: RawImageItem[]; sprites?: { imageSize?: unknown } }>,
    spritesIndexPath ? fetchJson(datasetUrl(spritesIndexPath)).catch(() => ({})) : Promise.resolve({}),
  ]);
  const spriteIndex = rawSprites as Record<string, RawSprite>;
  const imageSize = data.sprites?.imageSize;
  const sheetWidth = Array.isArray(imageSize) && isFiniteNumber(imageSize[0]) ? imageSize[0] : null;
  const sheetHeight = Array.isArray(imageSize) && isFiniteNumber(imageSize[1]) ? imageSize[1] : null;
  const results: ImageResult[] = [];
  (data.items ?? []).forEach((raw, index) => {
    if (typeof raw.title !== 'string' || typeof raw.manifestUrl !== 'string') return;
    const id = typeof raw.id === 'string' ? raw.id : `${collectionId}::${index}`;
    const rawSprite = spriteIndex[id];
    let sprite: ImageSprite | null = null;
    if (
      spritesImagePath && sheetWidth !== null && sheetHeight !== null && rawSprite &&
      isFiniteNumber(rawSprite.x) && isFiniteNumber(rawSprite.y) &&
      isFiniteNumber(rawSprite.width) && isFiniteNumber(rawSprite.height)
    ) {
      sprite = {
        imageUrl: datasetUrl(spritesImagePath),
        sheetWidth,
        sheetHeight,
        x: rawSprite.x,
        y: rawSprite.y,
        width: rawSprite.width,
        height: rawSprite.height,
      };
    }
    results.push({
      kind: 'image',
      id,
      title: raw.title,
      year: typeof raw.year === 'string' ? raw.year : '',
      location: typeof raw.location === 'string' ? raw.location : '',
      manifestUrl: raw.manifestUrl,
      lon: isFiniteNumber(raw.lon) ? raw.lon : null,
      lat: isFiniteNumber(raw.lat) ? raw.lat : null,
      collectionId,
      collectionLabel,
      sprite,
    });
  });
  return results;
}

let imageCollectionsPromise: Promise<ImageResult[]> | null = null;

export function loadImageCollections(): Promise<ImageResult[]> {
  if (imageCollectionsPromise) return imageCollectionsPromise;
  imageCollectionsPromise = fetchImageCollections();
  return imageCollectionsPromise;
}

async function fetchImageCollections(): Promise<ImageResult[]> {
  try {
    const response = await fetch(datasetUrl('imagecollection.yaml'));
    if (!response.ok) return [];

    const registry = parse(await response.text()) as ImageCollectionRegistry;
    const images: ImageResult[] = [];
    await Promise.all(
      (registry.collections ?? []).map(async (collection) => {
        if (typeof collection.id !== 'string' || typeof collection.artifacts?.index !== 'string') return;
        const label = typeof collection.label === 'string' ? collection.label : collection.id;
        await loadImages(
          datasetUrl(collection.artifacts.index),
          collection.id,
          label,
          typeof collection.artifacts.sprites === 'string' ? collection.artifacts.sprites : undefined,
          typeof collection.artifacts.spritesIndex === 'string' ? collection.artifacts.spritesIndex : undefined
        )
          .then((items) => void images.push(...items))
          .catch(() => {});
      })
    );
    return images;
  } catch {
    // Image collections are optional; their registry must not take down toponym/sheet search.
    return [];
  }
}

/**
 * Fetches every layer's toponym and sheet search artifacts in parallel. A failure on
 * one layer's artifact is non-fatal — it just contributes no results for that layer.
 */
export async function loadSearchIndex(layersUrl: string): Promise<SearchIndex> {
  const [sources, images] = await Promise.all([loadSearchSources(layersUrl), loadImageCollections()]);
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

  return { toponyms, sheets, images };
}
