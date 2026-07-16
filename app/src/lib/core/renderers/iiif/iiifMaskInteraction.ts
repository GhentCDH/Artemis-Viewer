import type maplibregl from 'maplibre-gl';
import { iiifLayerId } from './iiifLayerRuntime';

export interface IiifMaskHit {
  imageId: string;
  manifestUrl: string;
  sublayerId: string;
}

export type ActiveIiifMask = Pick<IiifMaskHit, 'manifestUrl' | 'imageId'>;

/**
 * Structural filter comparison against what the style already holds. Guarding on the live
 * style (rather than a cached "last applied" value) stays correct when reconciliation tears
 * a mask layer down and recreates it with its default filter. The guard matters because
 * `Map.setFilter` triggers a full repaint even when `Style.setFilter` no-ops on deepEqual.
 */
function filtersEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
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
  private readonly shouldYield?: (point: { x: number; y: number }) => boolean;

  constructor(
    map: maplibregl.Map,
    paneId: string,
    onSelect?: (hit: IiifMaskHit) => void,
    /** Masks span whole regions, so overlaid point targets (e.g. image pins) get priority at this point. */
    shouldYield?: (point: { x: number; y: number }) => boolean
  ) {
    this.map = map;
    this.paneId = paneId;
    this.onSelect = onSelect;
    this.shouldYield = shouldYield;
    map.on('mousemove', this.onMouseMove);
    map.on('mouseout', this.onMouseOut);
    map.on('click', this.onClick);
  }

  updateSublayers(sublayerIds: string[]): void {
    this.sublayerIds = sublayerIds;
    if (sublayerIds.length === 0) this.setHover(null);
  }

  setActive(active: ActiveIiifMask | null): void {
    try {
      for (const sublayerId of this.sublayerIds) {
        const filter: maplibregl.FilterSpecification = active
          ? active.imageId
            ? [
                'all',
                ['==', ['get', 'manifestUrl'], active.manifestUrl],
                ['>=', ['index-of', active.imageId, ['to-string', ['get', 'imageId']]], 0],
              ]
            : ['==', ['get', 'manifestUrl'], active.manifestUrl]
          : ['==', ['get', 'manifestUrl'], ''];
        for (const role of ['mask-active-fill', 'mask-active-outline']) {
          const layerId = iiifLayerId(this.paneId, sublayerId, role);
          if (!this.map.getLayer(layerId)) continue;
          if (filtersEqual(this.map.getFilter(layerId), filter)) continue;
          this.map.setFilter(layerId, filter);
        }
      }
    } catch {
      // The style may be swapping; reconciliation reapplies the active selection.
    }
  }

  /** Renderer reconciliation moves its own layers; keep the visible hover outline above them. */
  moveOutlineToFront(): void {
    try {
      const outlineLayerIds = this.sublayerIds
        .map((sublayerId) => iiifLayerId(this.paneId, sublayerId, 'mask-outline'))
        .filter((layerId) => Boolean(this.map.getLayer(layerId)));
      if (outlineLayerIds.length === 0) return;
      // Already in final position (the style's topmost layers, in this order)? Then don't
      // touch the style: `Style.moveLayer` dirties it and schedules a repaint even when the
      // move is a no-op, and this runs on every reconcile pass.
      const topOfOrder = this.map.getLayersOrder().slice(-outlineLayerIds.length);
      if (outlineLayerIds.every((layerId, index) => topOfOrder[index] === layerId)) return;
      for (const layerId of outlineLayerIds) this.map.moveLayer(layerId);
    } catch {
      // The style may be changing; the next reconciliation retries.
    }
  }

  private readonly onMouseMove = (event: maplibregl.MapMouseEvent): void => {
    if (this.frame !== null) return;
    const point = { x: event.point.x, y: event.point.y };
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const hit = this.shouldYield?.(point)
        ? null
        : hitTestIiifMasks(this.map, point, this.paneId, this.sublayerIds);
      this.setHover(hit);
      this.map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
  };

  private readonly onClick = (event: maplibregl.MapMouseEvent): void => {
    if (this.shouldYield?.(event.point)) return;
    const hit = hitTestIiifMasks(this.map, event.point, this.paneId, this.sublayerIds);
    if (hit) this.onSelect?.(hit);
  };

  private readonly onMouseOut = (): void => {
    this.setHover(null);
    this.map.getCanvas().style.cursor = '';
  };

  private setHover(hit: IiifMaskHit | null): void {
    try {
      // This runs per mousemove frame; the filtersEqual guards make the common case (hover
      // target unchanged, usually null -> null) mutation-free so it schedules no repaint.
      let changed = false;
      for (const sublayerId of this.sublayerIds) {
        const outlineLayerId = iiifLayerId(this.paneId, sublayerId, 'mask-outline');
        if (!this.map.getLayer(outlineLayerId)) continue;
        const selected = hit?.sublayerId === sublayerId;
        const filter: maplibregl.FilterSpecification = selected
          ? [
              'all',
              ['==', ['get', 'manifestUrl'], hit.manifestUrl],
              ['==', ['get', 'imageId'], hit.imageId],
            ]
          : ['==', ['get', 'manifestUrl'], ''];
        if (filtersEqual(this.map.getFilter(outlineLayerId), filter)) continue;
        this.map.setFilter(outlineLayerId, filter);
        changed = true;
      }
      if (changed) this.moveOutlineToFront();
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
