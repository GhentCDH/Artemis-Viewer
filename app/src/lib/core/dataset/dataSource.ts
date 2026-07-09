export const DATASET_BASE_URL = 'https://ghentcdh.github.io/Artemis-Data/build';

export function datasetUrl(path: string): string {
  return `${DATASET_BASE_URL}/${path.replace(/^\/+/, '')}`;
}
