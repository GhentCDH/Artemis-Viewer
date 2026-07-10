import type { NormalizedIiifImageInfo } from './geomapsTypes';

/**
 * The UGent IIIF server serves WebP but does not advertise it in `info.json`. Allmaps requests
 * `preferredFormats: ['webp', 'jpg']` but only emits `.webp` when the info it was given actually
 * advertises webp support — so without this patch it silently falls back to larger JPG tiles.
 * Remove once the server advertises WebP itself.
 */
function forceWebpFormat(info: Record<string, unknown>): Record<string, unknown> {
  const patched = { ...info };

  if (Array.isArray(patched.profile)) {
    patched.profile = (patched.profile as unknown[]).map((profile) => {
      if (profile && typeof profile === 'object' && Array.isArray((profile as { formats?: unknown }).formats)) {
        const formats = (profile as { formats: string[] }).formats;
        if (!formats.includes('webp')) {
          return { ...(profile as object), formats: [...formats, 'webp'] };
        }
      }
      return profile;
    });
  }

  const extraFormats = Array.isArray(patched.extraFormats) ? (patched.extraFormats as string[]) : [];
  patched.extraFormats = [...new Set([...extraFormats, 'webp'])];

  const preferredFormats = Array.isArray(patched.preferredFormats) ? (patched.preferredFormats as string[]) : [];
  patched.preferredFormats = ['webp', ...preferredFormats.filter((format) => format !== 'webp')];

  return patched;
}

/**
 * Advertised tile size fed to Allmaps, overriding the server's 256×256 grid. Allmaps' per-frame
 * cost is dominated by the number of cached tiles per map: its fragment shader linearly scans the
 * map's whole cached-tile texture array per pixel, and every arriving tile re-uploads that whole
 * array. 512px tiles quarter the tile count for the same viewport coverage (measured 2026-07:
 * 256px tiles produced 80–150-deep texture arrays and 500–1000ms frames at high zoom fullscreen).
 * The UGent image service is IIIF level2, so it serves arbitrary regions — tile requests off the
 * advertised grid are valid and were verified fast (~25ms). Trade-off: off-grid tiles may miss
 * shared caches populated by other IIIF viewers.
 */
const ALLMAPS_TILE_SIZE = 512;

function overrideTileSize(info: Record<string, unknown>): Record<string, unknown> {
  const patched = { ...info };
  const existingTiles = Array.isArray(patched.tiles) ? (patched.tiles as Array<{ scaleFactors?: number[] }>) : [];
  const scaleFactors = existingTiles[0]?.scaleFactors ?? [1, 2, 4, 8, 16, 32, 64];
  patched.tiles = [{ width: ALLMAPS_TILE_SIZE, height: ALLMAPS_TILE_SIZE, scaleFactors }];
  return patched;
}

export function buildAllmapsImageInfos(imageInfos: NormalizedIiifImageInfo[]): Record<string, unknown>[] {
  return imageInfos.map(({ info }) => overrideTileSize(forceWebpFormat(info)));
}
