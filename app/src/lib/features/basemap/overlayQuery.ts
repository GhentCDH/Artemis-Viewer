import type maplibregl from 'maplibre-gl';
import type { OverlayFeatureInfo, OverlayOption } from '$lib/core/map/basemap';
import { customOverlayLayerIds } from '$lib/core/map/basemap';

function setQueryValue(url: URL, name: string, value: string): void {
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase() === name.toLowerCase()) url.searchParams.delete(key);
  }
  url.searchParams.set(name, value);
}

function mercatorMeters(lng: number, lat: number): [number, number] {
  const radius = 6378137;
  const limitedLatitude = Math.min(85.05112878, Math.max(-85.05112878, lat));
  return [
    radius * lng * Math.PI / 180,
    radius * Math.log(Math.tan(Math.PI / 4 + limitedLatitude * Math.PI / 360)),
  ];
}

function displayProperties(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const document = value as {
    features?: Array<{ properties?: Record<string, unknown> }>;
    properties?: Record<string, unknown>;
  };
  if (Array.isArray(document.features)) return document.features[0]?.properties ?? null;
  return document.properties ?? value as Record<string, unknown>;
}

function parseTextFeatureInfo(body: string, infoFormat: string): Record<string, unknown> | null {
  const trimmed = body.trim().replace(/^\uFEFF/, '');
  if (!trimmed) return null;

  if (/json/i.test(infoFormat) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return displayProperties(JSON.parse(trimmed));
    } catch {
      // Some WMS implementations advertise JSON but return an XML/HTML exception.
      // Continue below so the user sees the server's actual message.
    }
  }

  if (trimmed.startsWith('<')) {
    const parsed = new DOMParser().parseFromString(trimmed, /html/i.test(infoFormat) ? 'text/html' : 'application/xml');
    const exception = parsed.querySelector('ServiceException, ExceptionText, parsererror');
    if (exception?.textContent?.trim()) throw new Error(exception.textContent.trim());

    const properties: Record<string, unknown> = {};
    for (const row of parsed.querySelectorAll('tr')) {
      const cells = row.querySelectorAll('th, td');
      if (cells.length >= 2) {
        const name = cells[0].textContent?.trim();
        const value = cells[1].textContent?.trim();
        if (name && value) properties[name] = value;
      }
    }
    if (Object.keys(properties).length > 0) return properties;
    const details = parsed.body?.textContent?.trim() || parsed.documentElement.textContent?.trim();
    return details ? { Details: details } : null;
  }

  const properties: Record<string, unknown> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (name && value) properties[name] = value;
  }
  return Object.keys(properties).length > 0 ? properties : { Details: trimmed };
}

async function queryWms(
  map: maplibregl.Map,
  overlay: OverlayOption,
  event: maplibregl.MapMouseEvent,
  infoFormat: string,
): Promise<OverlayFeatureInfo | null> {
  const url = new URL(overlay.url);
  const bounds = map.getBounds();
  const [west, south] = mercatorMeters(bounds.getWest(), bounds.getSouth());
  const [east, north] = mercatorMeters(bounds.getEast(), bounds.getNorth());
  const layers = [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === 'layers')?.[1] ?? '';
  const version = [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === 'version')?.[1] ?? '1.3.0';

  setQueryValue(url, 'SERVICE', 'WMS');
  setQueryValue(url, 'REQUEST', 'GetFeatureInfo');
  setQueryValue(url, 'QUERY_LAYERS', layers);
  setQueryValue(url, 'INFO_FORMAT', infoFormat);
  setQueryValue(url, 'FEATURE_COUNT', '10');
  setQueryValue(url, 'WIDTH', String(map.getContainer().clientWidth));
  setQueryValue(url, 'HEIGHT', String(map.getContainer().clientHeight));
  setQueryValue(url, 'BBOX', `${west},${south},${east},${north}`);
  if (version === '1.3.0') {
    setQueryValue(url, 'CRS', 'EPSG:3857');
    setQueryValue(url, 'I', String(Math.round(event.point.x)));
    setQueryValue(url, 'J', String(Math.round(event.point.y)));
  } else {
    setQueryValue(url, 'SRS', 'EPSG:3857');
    setQueryValue(url, 'X', String(Math.round(event.point.x)));
    setQueryValue(url, 'Y', String(Math.round(event.point.y)));
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`GetFeatureInfo returned HTTP ${response.status}.`);
  const body = await response.text();
  const properties = parseTextFeatureInfo(body, response.headers.get('content-type') || infoFormat);
  return properties ? { title: overlay.label, properties } : null;
}

export async function queryOverlayAtPoint(
  map: maplibregl.Map,
  overlay: OverlayOption,
  event: maplibregl.MapMouseEvent,
): Promise<OverlayFeatureInfo | null> {
  const capability = overlay.query;
  if (!capability || capability.status !== 'supported') return null;
  if (capability.strategy === 'wms-get-feature-info') {
    return queryWms(map, overlay, event, capability.infoFormat);
  }

  const layers = customOverlayLayerIds().filter((layerId) => map.getLayer(layerId));
  const feature = layers.length > 0
    ? map.queryRenderedFeatures(event.point, { layers })[0]
    : undefined;
  return feature?.properties
    ? { title: overlay.label, properties: feature.properties }
    : null;
}
