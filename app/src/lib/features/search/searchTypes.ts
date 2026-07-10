export interface ToponymResult {
  kind: 'toponym';
  id: string;
  text: string;
  lon: number;
  lat: number;
  layerId: string;
  layerLabel: string;
}

export interface SheetResult {
  kind: 'sheet';
  id: string;
  label: string;
  manifestUrl: string;
  lon: number;
  lat: number;
  bounds: [number, number, number, number] | null;
  layerId: string;
  layerLabel: string;
}

export interface ImageResult {
  kind: 'image';
  id: string;
  title: string;
  year: string;
  location: string;
  manifestUrl: string;
  lon: number | null;
  lat: number | null;
  collectionId: string;
  collectionLabel: string;
  sprite: ImageSprite | null;
}

export interface ImageSprite {
  imageUrl: string;
  sheetWidth: number;
  sheetHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SearchResult = ToponymResult | SheetResult | ImageResult;

export interface SearchIndex {
  toponyms: ToponymResult[];
  sheets: SheetResult[];
  images: ImageResult[];
}

export interface ScoredResult<T> {
  item: T;
  score: number;
}
