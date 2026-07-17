// Runtime (post-normalization) shapes for the geomaps bundle loaded by
// geomapsLoader.ts. The producer-side on-disk contract lives in Artemis-Data's
// src/lib/iiif/types.ts (CompactGeomap) — keep the two in sync.
export interface NormalizedGeomapsCanvas {
  imageId: string;
  label: string;
  imageServiceUrl: string;
  georeferencedMap: unknown;
  geoBbox: [number, number, number, number] | null;
  geoCenter: [number, number] | null;
}

export interface NormalizedIiifImageInfo {
  serviceUrl: string;
  info: Record<string, unknown>;
}

export interface GeomapsLoadResult {
  canvases: NormalizedGeomapsCanvas[];
  imageInfos: NormalizedIiifImageInfo[];
}
