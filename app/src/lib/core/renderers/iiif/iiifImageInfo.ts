import type { NormalizedIiifImageInfo } from './geomapsTypes';

/**
 * The UGent IIIF server currently sends WebP tile bodies 1 byte longer than their Content-Length
 * header. Firefox truncates the body to the header and decodes fine; Chromium's network stack
 * aborts the whole response (net::ERR_CONTENT_LENGTH_MISMATCH), so every WebP tile fails there.
 * Until the server is fixed, Chromium-based browsers must stay on the server's jpg default.
 */
function isChromiumBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData
    ?.brands;
  if (brands) return brands.some(({ brand }) => brand === 'Chromium');
  return /Chrome|Chromium|CriOS|Edg\//.test(navigator.userAgent);
}

/**
 * Chromium must not receive WebP tiles until the server's off-by-one Content-Length on WebP
 * bodies is fixed (see isChromiumBrowser). The server now advertises webp itself (`extraFormats`,
 * observed 2026-07-15), so skipping forceWebpFormat is not enough — webp must be actively
 * removed from every format list Allmaps consults, or it will still emit `.webp` tile URLs.
 */
function stripWebpFormat(info: Record<string, unknown>): Record<string, unknown> {
  const patched = { ...info };
  const withoutWebp = (formats: string[]) => formats.filter((format) => format !== 'webp');

  if (Array.isArray(patched.profile)) {
    patched.profile = (patched.profile as unknown[]).map((profile) => {
      if (profile && typeof profile === 'object' && Array.isArray((profile as { formats?: unknown }).formats)) {
        return { ...(profile as object), formats: withoutWebp((profile as { formats: string[] }).formats) };
      }
      return profile;
    });
  }
  if (Array.isArray(patched.extraFormats)) patched.extraFormats = withoutWebp(patched.extraFormats as string[]);
  if (Array.isArray(patched.preferredFormats)) patched.preferredFormats = withoutWebp(patched.preferredFormats as string[]);

  return patched;
}

/**
 * Historically the UGent IIIF server served WebP without advertising it in `info.json`, and
 * Allmaps only emits `.webp` when the info advertises it — this patch closed that gap. As of
 * 2026-07-15 the server advertises webp itself, making this a harmless no-op there; kept for
 * datasets/servers that still under-advertise.
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
  const transformFormats = isChromiumBrowser() ? stripWebpFormat : forceWebpFormat;
  return imageInfos.map(({ info }) => overrideTileSize(transformFormats(info)));
}
