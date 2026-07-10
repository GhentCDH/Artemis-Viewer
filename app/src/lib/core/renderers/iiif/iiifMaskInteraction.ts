import type maplibregl from 'maplibre-gl';
import { iiifLayerId } from './iiifLayerRuntime';

export interface IiifMaskHit {
  imageId: string;
  manifestUrl: string;
  sublayerId: string;
}

function geometryBboxArea(geometry: maplibregl.MapGeoJSONFeature['geometry']): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      const [x, y] = coordinates as [number, number];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    for (const child of coordinates) visit(child);
  };

  visit('coordinates' in geometry ? geometry.coordinates : []);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return Infinity;
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

/** Returns one sheet: topmost mask sublayer first, then smallest overlapping footprint. */
export function hitTestIiifMasks(
  map: maplibregl.Map,
  point: { x: number; y: number },
  paneId: string,
  sublayerIds: string[]
): IiifMaskHit | null {
  const sublayerByLayerId = new Map<string, string>();
  const maskLayerIds: string[] = [];
  for (const sublayerId of sublayerIds) {
    const layerId = iiifLayerId(paneId, sublayerId, 'masks');
    if (!map.getLayer(layerId)) continue;
    maskLayerIds.push(layerId);
    sublayerByLayerId.set(layerId, sublayerId);
  }
  if (maskLayerIds.length === 0) return null;

  const styleLayerIndex = new Map(map.getStyle().layers.map((layer, index) => [layer.id, index]));
  let best: (IiifMaskHit & { area: number; z: number }) | null = null;

  for (const feature of map.queryRenderedFeatures([point.x, point.y], { layers: maskLayerIds })) {
    const manifestUrl = String(feature.properties?.manifestUrl ?? '').trim();
    const imageId = String(feature.properties?.imageId ?? '').trim();
    const sublayerId = sublayerByLayerId.get(feature.layer.id);
    if (!manifestUrl || !sublayerId) continue;
    const area = geometryBboxArea(feature.geometry);
    const z = styleLayerIndex.get(feature.layer.id) ?? -1;
    if (!best || z > best.z || (z === best.z && area < best.area)) {
      best = { manifestUrl, imageId, sublayerId, area, z };
    }
  }

  if (!best) return null;
  return {
    manifestUrl: best.manifestUrl,
    imageId: best.imageId,
    sublayerId: best.sublayerId,
  };
}

export class IiifMaskInteraction {
  private readonly map: maplibregl.Map;
  private readonly paneId: string;
  private sublayerIds: string[] = [];
  private frame: number | null = null;
  private readonly onSelect?: (hit: IiifMaskHit) => void;

  constructor(map: maplibregl.Map, paneId: string, onSelect?: (hit: IiifMaskHit) => void) {
    this.map = map;
    this.paneId = paneId;
    this.onSelect = onSelect;
    map.on('mousemove', this.onMouseMove);
    map.on('mouseout', this.onMouseOut);
    map.on('click', this.onClick);
  }

  updateSublayers(sublayerIds: string[]): void {
    this.sublayerIds = sublayerIds;
    if (sublayerIds.length === 0) this.setHover(null);
  }

  /** Renderer reconciliation moves its own layers; keep the visible hover outline above them. */
  moveOutlineToFront(): void {
    try {
      for (const sublayerId of this.sublayerIds) {
        const outlineLayerId = iiifLayerId(this.paneId, sublayerId, 'mask-outline');
        if (this.map.getLayer(outlineLayerId)) this.map.moveLayer(outlineLayerId);
      }
    } catch {
      // The style may be changing; the next reconciliation retries.
    }
  }

  private readonly onMouseMove = (event: maplibregl.MapMouseEvent): void => {
    if (this.frame !== null) return;
    const point = { x: event.point.x, y: event.point.y };
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const hit = hitTestIiifMasks(this.map, point, this.paneId, this.sublayerIds);
      this.setHover(hit);
      this.map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
  };

  private readonly onClick = (event: maplibregl.MapMouseEvent): void => {
    const hit = hitTestIiifMasks(this.map, event.point, this.paneId, this.sublayerIds);
    if (hit) this.onSelect?.(hit);
  };

  private readonly onMouseOut = (): void => {
    this.setHover(null);
    this.map.getCanvas().style.cursor = '';
  };

  private setHover(hit: IiifMaskHit | null): void {
    try {
      for (const sublayerId of this.sublayerIds) {
        const outlineLayerId = iiifLayerId(this.paneId, sublayerId, 'mask-outline');
        if (!this.map.getLayer(outlineLayerId)) continue;
        const selected = hit?.sublayerId === sublayerId;
        this.map.setFilter(
          outlineLayerId,
          selected
            ? [
                'all',
                ['==', ['get', 'manifestUrl'], hit.manifestUrl],
                ['==', ['get', 'imageId'], hit.imageId],
              ]
            : ['==', ['get', 'manifestUrl'], '']
        );
      }
      this.moveOutlineToFront();
    } catch {
      // The style may be swapping or tearing down; the next pointer move retries.
    }
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.map.off('mousemove', this.onMouseMove);
    this.map.off('mouseout', this.onMouseOut);
    this.map.off('click', this.onClick);
    this.map.getCanvas().style.cursor = '';
  }
}
