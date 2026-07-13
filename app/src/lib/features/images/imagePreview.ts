import { loadIiifViewerSource } from '$lib/features/viewer/manifest';

const PREVIEW_WIDTH = 400;

const previewUrlByManifest = new Map<string, Promise<string>>();

/**
 * Resolves an image's manifest to a bubble-sized IIIF preview URL. Cached per manifest
 * across bubble openings; failures are evicted so reopening the bubble retries.
 */
export function loadImagePreviewUrl(manifestUrl: string): Promise<string> {
  let pending = previewUrlByManifest.get(manifestUrl);
  if (!pending) {
    pending = loadIiifViewerSource(manifestUrl).then(
      (source) => `${source.imageServiceUrl}/full/${PREVIEW_WIDTH},/0/default.jpg`
    );
    pending.catch(() => previewUrlByManifest.delete(manifestUrl));
    previewUrlByManifest.set(manifestUrl, pending);
  }
  return pending;
}
