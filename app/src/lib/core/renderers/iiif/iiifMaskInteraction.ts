import type maplibregl from 'maplibre-gl';
import { readThemeColor } from '$lib/core/map/mapColors';
import { iiifLayerId } from './iiifLayerRuntime';

export interface IiifMaskHit {
  imageId: string;
  manifestUrl: string;
  sublayerId: string;
  geometry: maplibregl.MapGeoJSONFeature['geometry'];
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
      best = { manifestUrl, imageId, sublayerId, geometry: feature.geometry, area, z };
    }
  }

  if (!best) return null;
  return {
    manifestUrl: best.manifestUrl,
    imageId: best.imageId,
    sublayerId: best.sublayerId,
    geometry: best.geometry,
  };
}

export class IiifMaskInteraction {
  private readonly map: maplibregl.Map;
  private readonly paneId: string;
  private sublayerIds: string[] = [];
  private frame: number | null = null;
  private readonly hoverSourceId: string;
  private readonly hoverLayerId: string;
  private readonly onSelect?: (hit: IiifMaskHit) => void;

  constructor(map: maplibregl.Map, paneId: string, onSelect?: (hit: IiifMaskHit) => void) {
    this.map = map;
    this.paneId = paneId;
    this.hoverSourceId = `iiif-mask-hover-source-${paneId}`;
    this.hoverLayerId = `iiif-mask-hover-layer-${paneId}`;
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
    if (!this.map.getLayer(this.hoverLayerId)) return;
    try {
      this.map.moveLayer(this.hoverLayerId);
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

  private ensureHoverLayer(): void {
    if (!this.map.getSource(this.hoverSourceId)) {
      this.map.addSource(this.hoverSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!this.map.getLayer(this.hoverLayerId)) {
      this.map.addLayer({
        id: this.hoverLayerId,
        type: 'line',
        source: this.hoverSourceId,
        paint: {
          'line-color': readThemeColor('--color-accent', '#2f6f99'),
          'line-width': 1.5,
          'line-opacity': 0.9,
        },
      });
    }
  }

  private setHover(hit: IiifMaskHit | null): void {
    try {
      if (!hit && !this.map.getSource(this.hoverSourceId)) return;
      this.ensureHoverLayer();
      const source = this.map.getSource(this.hoverSourceId) as maplibregl.GeoJSONSource;
      source.setData({
        type: 'FeatureCollection',
        features: hit ? [{ type: 'Feature', properties: {}, geometry: hit.geometry }] : [],
      });
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
    if (this.map.getLayer(this.hoverLayerId)) this.map.removeLayer(this.hoverLayerId);
    if (this.map.getSource(this.hoverSourceId)) this.map.removeSource(this.hoverSourceId);
  }
}
