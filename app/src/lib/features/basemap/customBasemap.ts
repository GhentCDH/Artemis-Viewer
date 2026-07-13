import type { BasemapOption } from '$lib/core/map/basemap';

const CUSTOM_BASEMAPS_STORAGE_KEY = 'artemis.custom-basemaps.v1';

function isStoredCustomBasemap(value: unknown): value is BasemapOption {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BasemapOption>;
  if (
    typeof candidate.id !== 'string'
    || !candidate.id.startsWith('custom-')
    || typeof candidate.label !== 'string'
    || candidate.label.trim().length === 0
    || (candidate.kind !== 'raster' && candidate.kind !== 'wfs')
    || typeof candidate.url !== 'string'
  ) {
    return false;
  }

  try {
    const parsedUrl = new URL(candidate.url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadCustomBasemaps(): BasemapOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(CUSTOM_BASEMAPS_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(stored)) return [];

    const seenIds = new Set<string>();
    return stored.filter((value): value is BasemapOption => {
      if (!isStoredCustomBasemap(value) || seenIds.has(value.id)) return false;
      seenIds.add(value.id);
      return true;
    });
  } catch {
    return [];
  }
}

export function saveCustomBasemaps(basemaps: BasemapOption[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_BASEMAPS_STORAGE_KEY, JSON.stringify(basemaps));
  } catch {
    // The map remains available for this session if browser storage is unavailable.
  }
}

function requireHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The tile URL must use HTTP or HTTPS.');
  }
  return url;
}

function queryValue(url: URL, name: string): string | null {
  const match = [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1] ?? null;
}

function deleteQueryValue(url: URL, name: string): void {
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase() === name.toLowerCase()) url.searchParams.delete(key);
  }
}

function setQueryValue(url: URL, name: string, value: string): void {
  deleteQueryValue(url, name);
  url.searchParams.set(name, value);
}

function hasPlaceholder(url: string, placeholder: string): boolean {
  return url.toLowerCase().includes(`{${placeholder.toLowerCase()}}`);
}

function decodeEncodedPlaceholders(url: string): string {
  return url
    .replace(/%7B(-?[xyz])%7D/gi, (_match, coordinate: string) => `{${coordinate.toLowerCase()}}`)
    .replace(/%7Bbbox-epsg-3857%7D/gi, '{bbox-epsg-3857}');
}

export interface ResolvedCustomBasemap {
  kind: 'raster' | 'wfs';
  url: string;
}

export function resolveCustomBasemap(value: string): ResolvedCustomBasemap {
  const input = value.trim();
  const parsedUrl = requireHttpUrl(value);
  const original = parsedUrl.toString();

  const isXyzTemplate = hasPlaceholder(input, 'z')
    && hasPlaceholder(input, 'x')
    && (hasPlaceholder(input, 'y') || hasPlaceholder(input, '-y'));
  if (isXyzTemplate) {
    return { kind: 'raster', url: decodeEncodedPlaceholders(original) };
  }

  if (hasPlaceholder(input, 'TileMatrix')
    && hasPlaceholder(input, 'TileCol')
    && hasPlaceholder(input, 'TileRow')) {
    return {
      kind: 'raster',
      url: input
        .replace(/\{TileMatrix\}/gi, '{z}')
        .replace(/\{TileCol\}/gi, '{x}')
        .replace(/\{TileRow\}/gi, '{y}'),
    };
  }

  const service = queryValue(parsedUrl, 'SERVICE')?.toLowerCase();
  const request = queryValue(parsedUrl, 'REQUEST')?.toLowerCase();
  const endpointName = parsedUrl.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase();
  const isWmts = service === 'wmts'
    || request === 'gettile'
    || (endpointName === 'wmts' && queryValue(parsedUrl, 'LAYER') !== null)
    || queryValue(parsedUrl, 'TILEMATRIX') !== null
    || queryValue(parsedUrl, 'TILEROW') !== null
    || queryValue(parsedUrl, 'TILECOL') !== null;
  if (isWmts) {
    const layer = queryValue(parsedUrl, 'LAYER');
    if (!layer) {
      throw new Error('This looks like WMTS, but the URL has no LAYER parameter. Paste a complete GetTile request URL.');
    }
    const style = queryValue(parsedUrl, 'STYLE') || 'default';
    const format = queryValue(parsedUrl, 'FORMAT') || 'image/png';
    const tileMatrixSet = queryValue(parsedUrl, 'TILEMATRIXSET') || 'GoogleMapsVL';
    setQueryValue(parsedUrl, 'SERVICE', 'WMTS');
    setQueryValue(parsedUrl, 'REQUEST', 'GetTile');
    setQueryValue(parsedUrl, 'VERSION', '1.0.0');
    setQueryValue(parsedUrl, 'LAYER', layer);
    setQueryValue(parsedUrl, 'STYLE', style);
    setQueryValue(parsedUrl, 'FORMAT', format);
    setQueryValue(parsedUrl, 'TILEMATRIXSET', tileMatrixSet);
    setQueryValue(parsedUrl, 'TILEMATRIX', '{z}');
    setQueryValue(parsedUrl, 'TILEROW', '{y}');
    setQueryValue(parsedUrl, 'TILECOL', '{x}');
    return { kind: 'raster', url: decodeEncodedPlaceholders(parsedUrl.toString()) };
  }

  const isWms = service === 'wms'
    || request === 'getmap'
    || (endpointName === 'wms' && queryValue(parsedUrl, 'LAYERS') !== null);
  if (isWms) {
    const layers = queryValue(parsedUrl, 'LAYERS');
    if (!layers) {
      throw new Error('This looks like WMS, but the URL has no LAYERS parameter. Paste a complete GetMap request URL.');
    }
    const version = queryValue(parsedUrl, 'VERSION') || '1.3.0';
    const styles = queryValue(parsedUrl, 'STYLES') || '';
    const format = queryValue(parsedUrl, 'FORMAT') || 'image/png';
    const transparent = queryValue(parsedUrl, 'TRANSPARENT') || 'true';
    setQueryValue(parsedUrl, 'SERVICE', 'WMS');
    setQueryValue(parsedUrl, 'REQUEST', 'GetMap');
    setQueryValue(parsedUrl, 'VERSION', version);
    setQueryValue(parsedUrl, 'LAYERS', layers);
    setQueryValue(parsedUrl, 'STYLES', styles);
    setQueryValue(parsedUrl, 'FORMAT', format);
    setQueryValue(parsedUrl, 'TRANSPARENT', transparent);
    setQueryValue(parsedUrl, 'WIDTH', '256');
    setQueryValue(parsedUrl, 'HEIGHT', '256');
    if (version === '1.3.0') {
      setQueryValue(parsedUrl, 'CRS', 'EPSG:3857');
      deleteQueryValue(parsedUrl, 'SRS');
    } else {
      setQueryValue(parsedUrl, 'SRS', 'EPSG:3857');
      deleteQueryValue(parsedUrl, 'CRS');
    }
    setQueryValue(parsedUrl, 'BBOX', '{bbox-epsg-3857}');
    return { kind: 'raster', url: decodeEncodedPlaceholders(parsedUrl.toString()) };
  }

  const isWfs = service === 'wfs'
    || request === 'getfeature'
    || (endpointName === 'wfs'
      && (queryValue(parsedUrl, 'TYPENAMES') !== null || queryValue(parsedUrl, 'TYPENAME') !== null));
  if (isWfs) {
    const typeNames = queryValue(parsedUrl, 'TYPENAMES') || queryValue(parsedUrl, 'TYPENAME');
    if (!typeNames) {
      throw new Error('This looks like WFS, but the URL has no TYPENAMES parameter. Paste a complete GetFeature request URL.');
    }
    const version = queryValue(parsedUrl, 'VERSION') || '2.0.0';
    setQueryValue(parsedUrl, 'SERVICE', 'WFS');
    setQueryValue(parsedUrl, 'REQUEST', 'GetFeature');
    setQueryValue(parsedUrl, 'VERSION', version);
    if (version.startsWith('2')) {
      setQueryValue(parsedUrl, 'TYPENAMES', typeNames);
      deleteQueryValue(parsedUrl, 'TYPENAME');
    } else {
      setQueryValue(parsedUrl, 'TYPENAME', typeNames);
      deleteQueryValue(parsedUrl, 'TYPENAMES');
    }
    setQueryValue(parsedUrl, 'OUTPUTFORMAT', 'application/json');
    setQueryValue(parsedUrl, 'SRSNAME', 'EPSG:4326');
    return { kind: 'wfs', url: parsedUrl.toString() };
  }

  if (/\.geojson(?:$|\?)/i.test(input)) {
    return { kind: 'wfs', url: original };
  }

  throw new Error(
    'We could not identify this map URL. XYZ/TMS URLs need {z}, {x}, and {y}; WMTS, WMS, or WFS URLs need SERVICE plus a layer or type-name parameter.'
  );
}

export function tileUrlForValidation(tileUrl: string): string {
  return tileUrl
    .replace(/\{z\}/gi, '10')
    .replace(/\{x\}/gi, '526')
    .replace(/\{y\}/gi, '341')
    .replace(/\{-y\}/gi, '682')
    .replace(/\{bbox-epsg-3857\}/gi, '391357.5848,6574807.4249,430493.3433,6613943.1835');
}

export function validateTileImage(tileUrl: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = '';
      reject(new Error('The tile server did not respond within 6 seconds.'));
    }, timeoutMs);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('The tile server did not return an image for the test location.'));
    };
    image.src = tileUrlForValidation(tileUrl);
  });
}

export async function validateWfsGeoJson(url: string, timeoutMs = 6000): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The WFS server returned HTTP ${response.status}.`);
    const document = await response.json() as { type?: string };
    if (document.type !== 'FeatureCollection' && document.type !== 'Feature') {
      throw new Error('The WFS response is not GeoJSON. Check that the service supports JSON output.');
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error('The WFS server did not respond within 6 seconds.');
    }
    if (reason instanceof TypeError) {
      throw new Error('The WFS response could not be loaded. The server may block browser requests or may not provide GeoJSON.');
    }
    throw reason;
  } finally {
    window.clearTimeout(timeout);
  }
}
