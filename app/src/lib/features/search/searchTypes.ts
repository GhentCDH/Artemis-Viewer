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

export type SearchResult = ToponymResult | SheetResult;

export interface SearchIndex {
  toponyms: ToponymResult[];
  sheets: SheetResult[];
}

export interface ScoredResult<T> {
  item: T;
  score: number;
}
