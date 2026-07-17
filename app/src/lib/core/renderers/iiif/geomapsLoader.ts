// Loads and normalizes the `IIIF/<mapId>_geomaps.json` bundle (geomapsVersion: 1)
// produced by Artemis-Data's src/lib/iiif/geomaps.ts — the compact on-disk shape
// is defined there (CompactGeomap); this file re-derives the runtime shape.
import type { GeomapsLoadResult, NormalizedGeomapsCanvas, NormalizedIiifImageInfo } from './geomapsTypes';

interface RawGeomapsMap {
  imageId?: string;
  label?: string;
  width?: number;
  height?: number;
  transformation?: string;
  gcps?: number[][];
  resourceMask?: number[];
  iiifOverrides?: Record<string, unknown>;
}

interface RawGeomapsDocument {
  baseImageUrl?: string;
  iiifDefaults?: Record<string, unknown>;
  maps?: RawGeomapsMap[];
}

type AllmapsGcp = { resource: [number, number]; geo: [number, number] };

const cache = new Map<string, Promise<GeomapsLoadResult>>();

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function toAllmapsGcps(flat: number[][] | undefined): AllmapsGcp[] {
  if (!Array.isArray(flat)) return [];
  const out: AllmapsGcp[] = [];
  for (const gcp of flat) {
    if (!Array.isArray(gcp) || gcp.length < 4) continue;
    out.push({ resource: [Number(gcp[0]), Number(gcp[1])], geo: [Number(gcp[2]), Number(gcp[3])] });
  }
  return out;
}

function toAllmapsResourceMask(flat: number[] | undefined): Array<[number, number]> {
  if (!Array.isArray(flat)) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([Number(flat[i]), Number(flat[i + 1])]);
  return out;
}

function geoBoundsFromGcps(gcps: AllmapsGcp[]): { bbox: [number, number, number, number] | null; center: [number, number] | null } {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  for (const gcp of gcps) {
    const [lon, lat] = gcp.geo;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    sumLon += lon;
    sumLat += lat;
    count++;
  }

  if (count === 0) return { bbox: null, center: null };
  return { bbox: [minLon, minLat, maxLon, maxLat], center: [sumLon / count, sumLat / count] };
}

/**
 * Normalizes a Data-build-v2 compact `geomaps.json` (flat per-canvas `maps[]`, top-level
 * `baseImageUrl`/`iiifDefaults`) into Allmaps GeoreferencedMap annotations plus the IIIF image
 * info Allmaps needs to fetch tiles for each canvas.
 */
export async function loadGeomaps(datasetBaseUrl: string, geomapsPath: string): Promise<GeomapsLoadResult> {
  const cacheKey = `${datasetBaseUrl.replace(/\/+$/, '')}::${geomapsPath}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<GeomapsLoadResult> => {
    const url = joinUrl(datasetBaseUrl, geomapsPath);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch geomaps: ${response.status} ${url}`);
    }
    const doc = (await response.json()) as RawGeomapsDocument;
    const baseImageUrl = doc.baseImageUrl ?? '';
    const toServiceUrl = (imageId: string): string =>
      (/^https?:\/\//i.test(imageId) ? imageId : `${baseImageUrl}${imageId}`).replace(/\/+$/, '');

    const canvases: NormalizedGeomapsCanvas[] = [];
    const imageInfos: NormalizedIiifImageInfo[] = [];

    for (const map of doc.maps ?? []) {
      const imageId = String(map.imageId ?? '').trim();
      if (!imageId) continue;

      const imageServiceUrl = toServiceUrl(imageId);
      const gcps = toAllmapsGcps(map.gcps);
      const resourceMask = toAllmapsResourceMask(map.resourceMask);
      const info = { ...(map.iiifOverrides ?? doc.iiifDefaults ?? {}) };
      const resourceType = typeof info.type === 'string' ? info.type : 'ImageService2';

      const georeferencedMap = {
        '@context': 'https://schemas.allmaps.org/map/2/context.json',
        type: 'GeoreferencedMap',
        resource: { id: imageServiceUrl, type: resourceType, width: map.width, height: map.height },
        gcps,
        resourceMask,
        transformation: { type: map.transformation ?? 'polynomial1' },
      };

      const { bbox, center } = geoBoundsFromGcps(gcps);

      canvases.push({
        imageId,
        label: String(map.label ?? imageId).trim(),
        imageServiceUrl,
        georeferencedMap,
        geoBbox: bbox,
        geoCenter: center,
      });

      imageInfos.push({
        serviceUrl: imageServiceUrl,
        info: {
          ...info,
          id: imageServiceUrl,
          '@id': imageServiceUrl,
          ...(map.width ? { width: map.width } : {}),
          ...(map.height ? { height: map.height } : {}),
        },
      });
    }

    return { canvases, imageInfos };
  })().catch((err) => {
    cache.delete(cacheKey);
    throw err;
  });

  cache.set(cacheKey, promise);
  return promise;
}
