import { encodeAppState, type UrlAppState } from './urlState';

export const URL_UPDATE_DEBOUNCE_MS = 400;

export interface UrlPersistence {
  update: () => void;
  schedule: () => void;
  dispose: () => void;
}

/**
 * Keeps the current view in the hash without adding a browser-history entry.
 * Camera moves use schedule(); discrete state changes use update().
 */
export function createUrlPersistence(
  datasetBaseUrl: string,
  readState: () => UrlAppState
): UrlPersistence {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function update(): void {
    clearTimeout(timer);
    timer = undefined;
    const encoded = encodeAppState(readState(), datasetBaseUrl);
    const nextUrl = encoded ? `#${encoded}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', nextUrl);
  }

  function schedule(): void {
    clearTimeout(timer);
    timer = setTimeout(update, URL_UPDATE_DEBOUNCE_MS);
  }

  function dispose(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  return { update, schedule, dispose };
}

