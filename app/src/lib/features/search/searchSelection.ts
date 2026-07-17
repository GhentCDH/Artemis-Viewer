import type maplibregl from 'maplibre-gl';
import { timelineSelection } from '$lib/features/timeline/timelineSelectionStore.svelte';
import { imageBrowser } from '$lib/features/images/imageBrowserStore.svelte';
import type { SearchResult } from './searchTypes';

const TOPONYM_FOCUS_ZOOM = 15;

export interface SearchMapPanes {
  leftMap: maplibregl.Map | null;
  rightMap: maplibregl.Map | null;
}

export interface SearchFocusTarget {
  map: maplibregl.Map;
  lngLat: [number, number];
}

/** Activates a historical result's layer, then flies the relevant map to the selected result. */
export function focusSearchResult(result: SearchResult, panes: SearchMapPanes): SearchFocusTarget | null {
  if (result.kind === 'image') {
    if (result.lon !== null && result.lat !== null && panes.leftMap) {
      panes.leftMap.flyTo({
        center: [result.lon, result.lat],
        zoom: Math.max(panes.leftMap.getZoom(), TOPONYM_FOCUS_ZOOM),
      });
      // Opens the images panel too (making the pins visible) — the bubble waits
      // hidden until the flight brings its anchor on screen.
      imageBrowser.showPreview(result);
      return { map: panes.leftMap, lngLat: [result.lon, result.lat] };
    }
    return null;
  }

  const pane = timelineSelection.focusLayer(result.layerId);
  const map = pane === 'left' ? panes.leftMap : panes.rightMap;
  if (!map) return null;

  if (result.kind === 'sheet' && result.bounds) {
    map.fitBounds(result.bounds, { padding: 64, maxZoom: 17, duration: 800 });
    return { map, lngLat: [result.lon, result.lat] };
  }

  map.flyTo({ center: [result.lon, result.lat], zoom: Math.max(map.getZoom(), TOPONYM_FOCUS_ZOOM) });
  return { map, lngLat: [result.lon, result.lat] };
}
