import { parse } from 'yaml';
import type { BasemapOption, OverlayOption } from '$lib/core/map/basemap';
import { resolveCustomBasemap } from './customBasemap';

interface MapServiceEntry {
  id?: unknown;
  shortLabel?: unknown;
  longLabel?: unknown;
  url?: unknown;
}

interface MapServicesDocument {
  basemaps?: MapServiceEntry[];
  overlays?: MapServiceEntry[];
}

export interface MapServiceRegistry {
  basemaps: BasemapOption[];
  overlays: OverlayOption[];
}

function requiredText(value: unknown, field: string, id: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Map service “${id}” has no ${field}.`);
  }
  return value.trim();
}

function normalizeEntry(entry: MapServiceEntry): {
  id: string;
  label: string;
  longLabel: string;
  url: string;
} {
  const id = requiredText(entry.id, 'id', 'unknown');
  return {
    id,
    label: requiredText(entry.shortLabel, 'shortLabel', id),
    longLabel: requiredText(entry.longLabel, 'longLabel', id),
    url: requiredText(entry.url, 'url', id),
  };
}

export async function loadMapServiceRegistry(url: string): Promise<MapServiceRegistry> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch map service registry: ${response.status} ${url}`);
  }
  const document = parse(await response.text()) as MapServicesDocument;

  const basemaps = (document.basemaps ?? []).map((rawEntry): BasemapOption => {
    const entry = normalizeEntry(rawEntry);
    const resolved = resolveCustomBasemap(entry.url);
    return { ...entry, kind: resolved.kind, url: resolved.url };
  });

  // Query capability is NOT probed here: doing so cost one GetCapabilities fetch per WMS
  // overlay during startup for menus the user may never open. The serviceType is kept on the
  // option and the probe happens on first selection (see Canvas.svelte's overlay handler).
  const overlays = (document.overlays ?? []).map((rawEntry): OverlayOption => {
    const entry = normalizeEntry(rawEntry);
    const resolved = resolveCustomBasemap(entry.url);
    return {
      ...entry,
      kind: resolved.kind,
      url: resolved.url,
      serviceType: resolved.serviceType,
    };
  });

  return { basemaps, overlays };
}
