import type maplibregl from 'maplibre-gl';
import { readThemeColor } from '$lib/core/map/mapColors';
import { isIiifLayerRole } from '$lib/core/renderers/iiif/iiifLayerRuntime';
import type { ImageResult } from '$lib/features/search/searchTypes';

const SOURCE_ID = 'artemis-image-collection';
const LAYER_ID = 'artemis-image-collection-pins';
const CLUSTER_LAYER_ID = 'artemis-image-collection-clusters';
const ICON_ID = 'artemis-image-collection-landscape-clustered-pin';
const CLUSTER_ICON_PREFIX = 'artemis-image-collection-landscape-cluster-wide-';
const LEGACY_ICON_IDS = [
  'artemis-image-collection-landscape-dark-pin',
  'artemis-image-collection-landscape-shadowed-pin',
  'artemis-image-collection-landscape-muted-blue-pin',
  'artemis-image-collection-landscape-light-blue-pin',
  'artemis-image-collection-landscape-bright-pin',
  'artemis-image-collection-landscape-filled-pin',
  'artemis-image-collection-landscape-line-light',
  'artemis-image-collection-landscapes-button',
  'artemis-image-collection-square-landscape',
  'artemis-image-collection-square-landscape-inverted',
  'artemis-image-collection-camera',
  'artemis-image-collection-landscape',
  'artemis-image-collection-landscape-square',
  'artemis-image-collection-landscape-square-light',
  'artemis-image-collection-landscape-square-muted',
] as const;

interface ImagePinState {
  images: ImageResult[];
  visible: boolean;
  /** Bumped only when `images` is a new array — the signal that the source data must be resent. */
  revision: number;
}

const stateByMap = new WeakMap<maplibregl.Map, ImagePinState>();
// restoreImagePins runs on every styledata/idle reconcile pass; `setData` has no
// unchanged-data short-circuit in MapLibre (every call is a worker round-trip, a recluster,
// and a repaint — which re-fires `idle` and made the reconcile cycle self-sustaining), so the
// applied revision per map is what keeps the steady state mutation-free.
const appliedRevisionByMap = new WeakMap<maplibregl.Map, number>();
const legacyIconsPurgedMaps = new WeakSet<maplibregl.Map>();

/** MapLibre pixels do not inherit rem sizing; use a slightly steeper version of the root scale. */
function responsivePinScale(): number {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  if (!Number.isFinite(rootFontSize)) return 1;
  return Math.min(1.2, Math.max(0.65, 1 + ((rootFontSize - 16) * 0.08)));
}

function syncResponsivePinScale(map: maplibregl.Map): void {
  const scale = responsivePinScale();
  for (const layerId of [CLUSTER_LAYER_ID, LAYER_ID]) {
    if (map.getLayer(layerId) && map.getLayoutProperty(layerId, 'icon-size') !== scale) {
      map.setLayoutProperty(layerId, 'icon-size', scale);
    }
  }
}

function createLandscapeIcon(clusterCount?: number): ImageData {
  const cluster = clusterCount !== undefined;
  const size = 48;
  const width = cluster ? 84 : size;
  const glyphOffset = cluster ? 36 : 0;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the image-pin icon');

  const accent = readThemeColor('--color-map-image-pin', '#425d6e');
  const surface = readThemeColor('--color-surface-control', '#fbf8f1');
  const shadow = readThemeColor('--color-map-image-pin-shadow', '#000000');
  context.fillStyle = accent;
  context.shadowColor = shadow;
  context.shadowBlur = 3.5;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.beginPath();
  context.roundRect(4, 4, width - 8, 40, 5);
  context.fill();
  context.shadowColor = 'transparent';

  context.strokeStyle = surface;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (clusterCount !== undefined) {
    context.fillStyle = surface;
    context.font = "600 16px 'Space Mono', monospace";
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(clusterCount), 22, 25);
  }

  // Map pins use the Landscapes glyph's inner sun and mountain linework only.
  context.beginPath();
  context.arc(16.4 + glyphOffset, 18.6, 3.4, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.moveTo(11 + glyphOffset, 33);
  context.lineTo(19.4 + glyphOffset, 24.6);
  context.lineTo(25.8 + glyphOffset, 30.6);
  context.lineTo(30.4 + glyphOffset, 26.2);
  context.lineTo(37 + glyphOffset, 33);
  context.stroke();
  return context.getImageData(0, 0, width, size);
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
  const previous = stateByMap.get(map);
  const revision = previous && previous.images === images ? previous.revision : (previous?.revision ?? 0) + 1;
  stateByMap.set(map, { images, visible, revision });
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
  for (let count = 2; count <= state.images.length; count += 1) {
    const clusterIconId = `${CLUSTER_ICON_PREFIX}${count}`;
    if (!map.hasImage(clusterIconId)) {
      map.addImage(clusterIconId, createLandscapeIcon(count), { pixelRatio: 2 });
    }
  }

  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    if (appliedRevisionByMap.get(map) !== state.revision) {
      source.setData(featureCollection(state.images));
      appliedRevisionByMap.set(map, state.revision);
    }
  } else {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: featureCollection(state.images),
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 28,
    });
    appliedRevisionByMap.set(map, state.revision);
  }

  if (!map.getLayer(CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': ['concat', CLUSTER_ICON_PREFIX, ['to-string', ['get', 'point_count']]],
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        visibility: state.visible ? 'visible' : 'none',
      },
    });
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
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
  }
  const visibility = state.visible ? 'visible' : 'none';
  for (const layerId of [CLUSTER_LAYER_ID, LAYER_ID]) {
    if (map.getLayoutProperty(layerId, 'visibility') !== visibility) {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  }

  if (!legacyIconsPurgedMaps.has(map)) {
    legacyIconsPurgedMaps.add(map);
    for (const legacyIconId of LEGACY_ICON_IDS) {
      if (map.hasImage(legacyIconId)) map.removeImage(legacyIconId);
    }
  }

  syncResponsivePinScale(map);
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
  const pinIndex = styleLayers.findIndex((layer) => layer.id === CLUSTER_LAYER_ID || layer.id === LAYER_ID);
  if (pinIndex === -1) return;
  const obstructed = styleLayers
    .slice(pinIndex + 1)
    .some((layer) => !isIiifLayerRole(layer.id, 'mask-outline'));
  if (obstructed) {
    map.moveLayer(CLUSTER_LAYER_ID);
    map.moveLayer(LAYER_ID);
  }
}

function clusterAt(map: maplibregl.Map, point: { x: number; y: number }): maplibregl.MapGeoJSONFeature | null {
  if (!map.getLayer(CLUSTER_LAYER_ID)) return null;
  return map.queryRenderedFeatures([point.x, point.y], { layers: [CLUSTER_LAYER_ID] })[0] ?? null;
}

function pinIdAt(map: maplibregl.Map, point: { x: number; y: number }): string | null {
  if (!map.getLayer(LAYER_ID)) return null;
  const feature = map.queryRenderedFeatures([point.x, point.y], { layers: [LAYER_ID] })[0];
  const id = feature?.properties?.id;
  return typeof id === 'string' ? id : null;
}

/**
 * Whether a visible image pin renders at this screen point — mask interaction yields to pins.
 * One query across both pin layers: this runs per mousemove frame (mask shouldYield and the
 * hover cursor below), where the previous pin-then-cluster pair doubled the hit-test cost.
 */
export function hasImagePinAt(map: maplibregl.Map, point: { x: number; y: number }): boolean {
  const layers = [LAYER_ID, CLUSTER_LAYER_ID].filter((layerId) => map.getLayer(layerId));
  if (layers.length === 0) return false;
  return map.queryRenderedFeatures([point.x, point.y], { layers }).length > 0;
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
    const cluster = clusterAt(map, event.point);
    const clusterId = cluster?.properties?.cluster_id;
    if (cluster && typeof clusterId === 'number' && cluster.geometry.type === 'Point') {
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
      const center = cluster.geometry.coordinates as [number, number];
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center, zoom });
      });
      onMapClick(null);
      return;
    }
    onMapClick(pinIdAt(map, event.point));
  };

  const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
    if (frame !== null) return;
    const point = { x: event.point.x, y: event.point.y };
    frame = requestAnimationFrame(() => {
      frame = null;
      const next = hasImagePinAt(map, point);
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

  const handleResize = () => syncResponsivePinScale(map);

  map.on('click', handleClick);
  map.on('mousemove', handleMouseMove);
  map.on('mouseout', handleMouseOut);
  map.on('resize', handleResize);
  window.addEventListener('resize', handleResize);
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    map.off('click', handleClick);
    map.off('mousemove', handleMouseMove);
    map.off('mouseout', handleMouseOut);
    map.off('resize', handleResize);
    window.removeEventListener('resize', handleResize);
    if (hovering) map.getCanvas().style.cursor = '';
  };
}

export function removeImagePins(map: maplibregl.Map): void {
  const imageCount = stateByMap.get(map)?.images.length ?? 0;
  stateByMap.delete(map);
  appliedRevisionByMap.delete(map);
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getLayer(CLUSTER_LAYER_ID)) map.removeLayer(CLUSTER_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  if (map.hasImage(ICON_ID)) map.removeImage(ICON_ID);
  for (let count = 2; count <= imageCount; count += 1) {
    const clusterIconId = `${CLUSTER_ICON_PREFIX}${count}`;
    if (map.hasImage(clusterIconId)) map.removeImage(clusterIconId);
  }
  for (const legacyIconId of LEGACY_ICON_IDS) {
    if (map.hasImage(legacyIconId)) map.removeImage(legacyIconId);
  }
}
