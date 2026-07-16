import maplibregl from 'maplibre-gl';
import type { LngLatBoundsLike, LngLatLike } from 'maplibre-gl';
import { registerMapProtocols } from './protocols';
import { createBaselayerStyle } from './basemap';
import { DEFAULT_MAPLIBRE_PAN_BOUNDS } from './mapBounds';

export type PaneId = 'left' | 'right';

export interface MapLibreInitCamera {
  center: LngLatLike;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface MapLibreInitOptions {
  container: HTMLElement;
  pmtilesUrl: string;
  /** Ignored when `initialCamera` is set. */
  initialBounds: LngLatBoundsLike;
  /** Opens the map already framing this camera instead of `initialBounds` — used to spawn a compare pane matching the other pane's current view. */
  initialCamera?: MapLibreInitCamera;
  panBounds?: LngLatBoundsLike;
}

export interface MapLibreInstance {
  paneId: PaneId;
  map: maplibregl.Map;
  destroy: () => void;
}

export function initializeMapLibre(paneId: PaneId, options: MapLibreInitOptions): MapLibreInstance {
  registerMapProtocols();
  const panBounds = options.panBounds ?? DEFAULT_MAPLIBRE_PAN_BOUNDS;
  const gridBounds = maplibregl.LngLatBounds.convert(panBounds).toArray();

  const map = new maplibregl.Map({
    container: options.container,
    style: createBaselayerStyle(options.pmtilesUrl, gridBounds),
    maxBounds: panBounds,
    fitBoundsOptions: { padding: 24 },
    // Hard-locked top-down: the IIIF warp layer alpha-blends overlapping canvases in insertion
    // order with no depth buffer, so any pitch breaks the "draw order == visual stacking"
    // assumption and produces visible popping. Pitch also blows up `getBounds()` (the viewport
    // driving Allmaps' loader), pulling in far more canvases than intended. `maxPitch: 0` makes
    // tilt physically impossible regardless of gesture; `pitchWithRotate: false` keeps drag-rotate
    // from trying to pitch at all.
    maxPitch: 0,
    pitchWithRotate: false,
    // Deliberately NOT preserveDrawingBuffer: keeping the backbuffer readable after
    // compositing turns the per-frame buffer swap into a copy (a permanent GPU tax,
    // worst on mobile/tiled GPUs). The screenshot export doesn't need it — it reads
    // each canvas inside a `render` event right after triggerRepaint(), before the
    // buffer can be cleared (see features/screenshot for the 2-part capture contract).
    // Lift MapLibre's default 4096px canvas cap so the drawing buffer is never silently
    // downscaled on large/high-DPR displays (suggested fix for a rendering bug).
    maxCanvasSize: [Infinity, Infinity],
    // Render at most 2x DPR. Fragment cost scales with drawing-buffer pixels — the Allmaps
    // warp shader especially (it scans a map's cached-tile texture array per pixel) — and
    // budget devices commonly pair DPR-2.5/3 screens with weak GPUs, where DPR 3 means 2.25x
    // the fragments of DPR 2 for sharpness a map view barely shows. DPR <= 2 displays are
    // unaffected. Screenshot export reads its ratio from the canvas backing store, so it
    // adapts to this cap automatically.
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    ...(options.initialCamera
      ? {
          center: options.initialCamera.center,
          zoom: options.initialCamera.zoom,
          bearing: options.initialCamera.bearing,
          pitch: options.initialCamera.pitch,
        }
      : { bounds: options.initialBounds }),
  });

  return {
    paneId,
    map,
    destroy: () => map.remove(),
  };
}
