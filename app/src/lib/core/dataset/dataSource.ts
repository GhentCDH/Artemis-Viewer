export type DatasetSource = 'published' | 'draft';

export const DATASET_BASE_URLS: Record<DatasetSource, string> = {
  published: 'https://ghentcdh.github.io/Artemis-Data/build',
  draft: 'https://raw.githubusercontent.com/GhentCDH/Artemis-Data/refs/heads/draft/build',
};

export const DATASET_BASE_URL = DATASET_BASE_URLS.published;
export const DATASET_SOURCE_STORAGE_KEY = 'artemis.dataset-source.v1';

export function datasetBaseUrl(source: DatasetSource): string {
  return DATASET_BASE_URLS[source];
}

export function activeDatasetSource(): DatasetSource {
  if (typeof window === 'undefined') return 'published';
  return window.localStorage.getItem(DATASET_SOURCE_STORAGE_KEY) === 'draft' ? 'draft' : 'published';
}

export function activeDatasetBaseUrl(): string {
  return datasetBaseUrl(activeDatasetSource());
}

export function datasetUrl(path: string, baseUrl = activeDatasetBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
