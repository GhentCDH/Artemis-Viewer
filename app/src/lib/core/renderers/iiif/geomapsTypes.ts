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
