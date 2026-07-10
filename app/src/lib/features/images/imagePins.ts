import type maplibregl from 'maplibre-gl';
import { readThemeColor } from '$lib/core/map/mapColors';
import type { ImageResult } from '$lib/features/search/searchTypes';

const SOURCE_ID = 'artemis-image-collection';
const LAYER_ID = 'artemis-image-collection-pins';
const ICON_ID = 'artemis-image-collection-camera';

function createCameraIcon(): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the image-pin icon');

  const accent = readThemeColor('--color-accent', '#3f789f');
  const contrast = readThemeColor('--color-accent-contrast', '#ffffff');
  context.fillStyle = accent;
  context.beginPath();
  context.arc(24, 24, 21, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = contrast;
  context.beginPath();
  context.roundRect(12, 17, 24, 17, 3);
  context.fill();
  context.fillRect(17, 13, 9, 6);
  context.fillStyle = accent;
  context.beginPath();
  context.arc(24, 25.5, 5.5, 0, Math.PI * 2);
  context.fill();
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
  if (!map.isStyleLoaded()) return;

  if (!map.hasImage(ICON_ID)) {
    map.addImage(ICON_ID, createCameraIcon(), { pixelRatio: 2 });
  }

  const data = featureCollection(images);
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
        visibility: visible ? 'visible' : 'none',
      },
    });
  } else {
    const visibility = visible ? 'visible' : 'none';
    if (map.getLayoutProperty(LAYER_ID, 'visibility') !== visibility) {
      map.setLayoutProperty(LAYER_ID, 'visibility', visibility);
    }
  }
}

export function removeImagePins(map: maplibregl.Map): void {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  if (map.hasImage(ICON_ID)) map.removeImage(ICON_ID);
}
