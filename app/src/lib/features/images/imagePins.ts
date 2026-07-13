import type maplibregl from 'maplibre-gl';
import { readThemeColor } from '$lib/core/map/mapColors';
import { isIiifLayerRole } from '$lib/core/renderers/iiif/iiifLayerRuntime';
import type { ImageResult } from '$lib/features/search/searchTypes';

const SOURCE_ID = 'artemis-image-collection';
const LAYER_ID = 'artemis-image-collection-pins';
const ICON_ID = 'artemis-image-collection-square-landscape-inverted';
const LEGACY_ICON_IDS = [
  'artemis-image-collection-camera',
  'artemis-image-collection-landscape',
  'artemis-image-collection-landscape-square',
  'artemis-image-collection-landscape-square-light',
  'artemis-image-collection-landscape-square-muted',
  'artemis-image-collection-square-landscape',
] as const;

interface ImagePinState {
  images: ImageResult[];
  visible: boolean;
}

const stateByMap = new WeakMap<maplibregl.Map, ImagePinState>();

function createLandscapeIcon(): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the image-pin icon');

  const accent = readThemeColor('--color-accent-muted', '#607d91');
  const surface = readThemeColor('--color-surface-control', '#fbf8f1');
  context.fillStyle = accent;
  context.strokeStyle = surface;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(3, 3, 42, 42, 5);
  context.fill();
  context.stroke();

  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.beginPath();
  context.roundRect(9, 9, 30, 30, 4);
  context.stroke();

  context.beginPath();
  context.arc(16.4, 18.6, 3.4, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.moveTo(11, 33);
  context.lineTo(19.4, 24.6);
  context.lineTo(25.8, 30.6);
  context.lineTo(30.4, 26.2);
  context.lineTo(37, 33);
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

function featureCollection(images: ImageResult[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: images.flatMap((image) =>
      image.lon === null || image.lat === null
        ? []
        : [{
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [image.lon, image.lat] },
            properties: { id: image.id, title: image.title, year: image.year },
          }]
    ),
  };
}

export function syncImagePins(map: maplibregl.Map, images: ImageResult[], visible: boolean): void {
  stateByMap.set(map, { images, visible });
  restoreImagePins(map);
}

/** Rebuilds any missing pin resources after a map-layer reconciliation. */
export function restoreImagePins(map: maplibregl.Map): void {
  const state = stateByMap.get(map);
  // `isStyleLoaded()` is transiently false while a newly selected meander's
  // sources load. The style is safe to edit once its background is registered.
  if (!state || !map.getLayer('background')) return;

  if (!map.hasImage(ICON_ID)) {
    map.addImage(ICON_ID, createLandscapeIcon(), { pixelRatio: 2 });
  }

  const data = featureCollection(state.images);
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(SOURCE_ID, { type: 'geojson', data });
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'icon-image': ICON_ID,
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        visibility: state.visible ? 'visible' : 'none',
      },
    });
  } else {
    if (map.getLayoutProperty(LAYER_ID, 'icon-image') !== ICON_ID) {
      map.setLayoutProperty(LAYER_ID, 'icon-image', ICON_ID);
    }
    const visibility = state.visible ? 'visible' : 'none';
    if (map.getLayoutProperty(LAYER_ID, 'visibility') !== visibility) {
      map.setLayoutProperty(LAYER_ID, 'visibility', visibility);
    }
  }

  for (const legacyIconId of LEGACY_ICON_IDS) {
    if (map.hasImage(legacyIconId)) map.removeImage(legacyIconId);
  }

  moveImagePinsToFront(map);
}

/**
 * Restores the image pins above opaque map sheets after sublayer reconciliation.
 *
 * The IIIF hover outline insists on being topmost (moveOutlineToFront, also
 * styledata-driven), so pins yield to it. Tolerating outline layers above is what
 * lets the two ordering policies converge instead of trading places forever.
 */
function moveImagePinsToFront(map: maplibregl.Map): void {
  const styleLayers = map.getStyle().layers;
  const pinIndex = styleLayers.findIndex((layer) => layer.id === LAYER_ID);
  if (pinIndex === -1) return;
  const obstructed = styleLayers
    .slice(pinIndex + 1)
    .some((layer) => !isIiifLayerRole(layer.id, 'mask-outline'));
  if (obstructed) {
    map.moveLayer(LAYER_ID);
  }
}

function pinIdAt(map: maplibregl.Map, point: { x: number; y: number }): string | null {
  if (!map.getLayer(LAYER_ID)) return null;
  const feature = map.queryRenderedFeatures([point.x, point.y], { layers: [LAYER_ID] })[0];
  const id = feature?.properties?.id;
  return typeof id === 'string' ? id : null;
}

/** Whether a visible image pin renders at this screen point — mask interaction yields to pins. */
export function hasImagePinAt(map: maplibregl.Map, point: { x: number; y: number }): boolean {
  return pinIdAt(map, point) !== null;
}

/**
 * Click and hover-cursor handling for the pin layer. Every map click is reported — with
 * the hit pin's image id, or null for clicks anywhere else (the preview bubble closes on
 * those). The cursor is written on every hovered frame but only cleared on the hover-off
 * transition: the IIIF mask interaction (registered earlier, so its writes land first)
 * clears the cursor whenever it yields to a pin, and writing unconditionally here would
 * stomp its pointer over mask-only areas.
 */
export function attachImagePinInteraction(
  map: maplibregl.Map,
  onMapClick: (imageId: string | null) => void
): () => void {
  let frame: number | null = null;
  let hovering = false;

  const handleClick = (event: maplibregl.MapMouseEvent) => {
    onMapClick(pinIdAt(map, event.point));
  };

  const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
    if (frame !== null) return;
    const point = { x: event.point.x, y: event.point.y };
    frame = requestAnimationFrame(() => {
      frame = null;
      const next = pinIdAt(map, point) !== null;
      if (next) map.getCanvas().style.cursor = 'pointer';
      else if (hovering) map.getCanvas().style.cursor = '';
      hovering = next;
    });
  };

  const handleMouseOut = () => {
    if (hovering) {
      hovering = false;
      map.getCanvas().style.cursor = '';
    }
  };

  map.on('click', handleClick);
  map.on('mousemove', handleMouseMove);
  map.on('mouseout', handleMouseOut);
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    map.off('click', handleClick);
    map.off('mousemove', handleMouseMove);
    map.off('mouseout', handleMouseOut);
    if (hovering) map.getCanvas().style.cursor = '';
  };
}

export function removeImagePins(map: maplibregl.Map): void {
  stateByMap.delete(map);
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  if (map.hasImage(ICON_ID)) map.removeImage(ICON_ID);
  for (const legacyIconId of LEGACY_ICON_IDS) {
    if (map.hasImage(legacyIconId)) map.removeImage(legacyIconId);
  }
}
