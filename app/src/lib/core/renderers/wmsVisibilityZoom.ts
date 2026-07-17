import type maplibregl from 'maplibre-gl';

const WEB_MERCATOR_WORLD_WIDTH = 40_075_016.68557849;
const TILE_SIZE = 256;
const OGC_PIXEL_SIZE_METERS = 0.00028;
const VISIBILITY_ZOOM_MARGIN = 0.01;

const minimumZoomByUrl = new Map<string, Promise<number | null>>();

function queryValue(url: URL, name: string): string | null {
  const entry = [...url.searchParams.entries()].find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? null;
}

function setQueryValue(url: URL, name: string, value: string): void {
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase() === name.toLowerCase()) url.searchParams.delete(key);
  }
  url.searchParams.set(name, value);
}

function findNamedLayer(document: XMLDocument, layerName: string): Element | null {
  return [...document.getElementsByTagNameNS('*', 'Layer')].find((layer) =>
    [...layer.children].some((child) => child.localName === 'Name' && child.textContent?.trim() === layerName)
  ) ?? null;
}

function directChildText(element: Element, localName: string): string | null {
  return [...element.children].find((child) => child.localName === localName)?.textContent?.trim() ?? null;
}

function zoomForScaleDenominator(scaleDenominator: number): number {
  const zoomZeroScaleDenominator = WEB_MERCATOR_WORLD_WIDTH / TILE_SIZE / OGC_PIXEL_SIZE_METERS;
  return Math.log2(zoomZeroScaleDenominator / scaleDenominator) + VISIBILITY_ZOOM_MARGIN;
}

async function discoverMinimumZoom(tileUrl: string): Promise<number | null> {
  let url: URL;
  try {
    url = new URL(tileUrl);
  } catch {
    return null;
  }

  const layerName = queryValue(url, 'LAYERS')?.split(',')[0]?.trim();
  if (!layerName) return null;

  setQueryValue(url, 'SERVICE', 'WMS');
  setQueryValue(url, 'REQUEST', 'GetCapabilities');
  for (const key of [...url.searchParams.keys()]) {
    if (!['service', 'request', 'version'].includes(key.toLowerCase())) url.searchParams.delete(key);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const document = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (document.querySelector('parsererror')) return null;
    const layer = findNamedLayer(document, layerName);
    const rawScale = layer ? directChildText(layer, 'MaxScaleDenominator') : null;
    const scaleDenominator = Number(rawScale);
    return Number.isFinite(scaleDenominator) && scaleDenominator > 0
      ? zoomForScaleDenominator(scaleDenominator)
      : null;
  } catch {
    return null;
  }
}

export function zoomToWmsVisibility(
  map: maplibregl.Map,
  tileUrl: string,
  isStillActive: () => boolean
): Promise<void> {
  let pending = minimumZoomByUrl.get(tileUrl);
  if (!pending) {
    pending = discoverMinimumZoom(tileUrl);
    minimumZoomByUrl.set(tileUrl, pending);
  }

  return pending.then((minimumZoom) => {
    if (isStillActive() && minimumZoom !== null && map.getZoom() < minimumZoom) {
      map.easeTo({ zoom: minimumZoom });
    }
  });
}
