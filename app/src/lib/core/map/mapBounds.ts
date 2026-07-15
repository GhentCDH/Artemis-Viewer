const BELGIUM_BOUNDS = [
  [2.53, 50.685],
  [5.92, 51.52],
] as const;

const LONGITUDE_PADDING_RATIO = 0.3;
const SOUTH_PADDING_RATIO = 1.8;
const NORTH_PADDING_RATIO = 0.35;

const [[west, south], [east, north]] = BELGIUM_BOUNDS;
const longitudeSpan = east - west;
const latitudeSpan = north - south;

export const DEFAULT_MAPLIBRE_PAN_BOUNDS: [[number, number], [number, number]] = [
  [west - longitudeSpan * LONGITUDE_PADDING_RATIO, south - latitudeSpan * SOUTH_PADDING_RATIO],
  [east + longitudeSpan * LONGITUDE_PADDING_RATIO, north + latitudeSpan * NORTH_PADDING_RATIO],
];
