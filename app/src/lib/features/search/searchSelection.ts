import type maplibregl from 'maplibre-gl';
import { timelineSelection } from '$lib/features/timeline/timelineSelection.svelte';
import { imageBrowser } from '$lib/features/images/imageBrowserState.svelte';
import type { SearchResult } from './searchTypes';

const TOPONYM_FOCUS_ZOOM = 15;

export interface SearchMapPanes {
  leftMap: maplibregl.Map | null;
  rightMap: maplibregl.Map | null;
}

/** Activates a historical result's layer, then flies the relevant map to the selected result. */
export function focusSearchResult(result: SearchResult, panes: SearchMapPanes): void {
  if (result.kind === 'image') {
    if (result.lon !== null && result.lat !== null) {
      panes.leftMap?.flyTo({
        center: [result.lon, result.lat],
        zoom: Math.max(panes.leftMap.getZoom(), TOPONYM_FOCUS_ZOOM),
      });
      // Opens the images panel too (making the pins visible) — the bubble waits
      // hidden until the flight brings its anchor on screen.
      imageBrowser.showPreview(result);
    }
    return;
  }

  const pane = timelineSelection.focusLayer(result.layerId);
  const map = pane === 'left' ? panes.leftMap : panes.rightMap;
  if (!map) return;

  if (result.kind === 'sheet' && result.bounds) {
    map.fitBounds(result.bounds, { padding: 64, maxZoom: 17, duration: 800 });
    return;
  }

  map.flyTo({ center: [result.lon, result.lat], zoom: Math.max(map.getZoom(), TOPONYM_FOCUS_ZOOM) });
}
