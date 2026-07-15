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
    // Screenshot-export contract (1 of 3): the drawing buffer must survive past the render
    // frame so `features/screenshot` can composite `map.getCanvas()`. The other two parts
    // live in the capture's render-event timing and the IIIF viewer's Anonymous CORS policy.
    canvasContextAttributes: { preserveDrawingBuffer: true },
    // Lift MapLibre's default 4096px canvas cap so the drawing buffer is never silently
    // downscaled on large/high-DPR displays (suggested fix for a rendering bug).
    maxCanvasSize: [Infinity, Infinity],
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
