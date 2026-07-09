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

export function buildAllmapsImageInfos(imageInfos: NormalizedIiifImageInfo[]): Record<string, unknown>[] {
  return imageInfos.map(({ info }) => forceWebpFormat(info));
}
