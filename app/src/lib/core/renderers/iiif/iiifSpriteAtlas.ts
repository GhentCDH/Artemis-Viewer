export interface IiifSprite {
  imageId: string;
  scaleFactor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteTileScale?: number;
  /** Deploy-root-relative path of this canvas's standalone sprite file (join with the dataset base URL), e.g. `Layers/<id>/sprites/<canvasAllmapsId>.webp`. Absent on builds older than the per-canvas sprite output. */
  file?: string;
}

export interface IiifSpriteAtlas {
  imageUrl: string;
  imageSize: [number, number];
  spritesByImageServiceUrl: Map<string, IiifSprite>;
}

const atlasCache = new Map<string, Promise<IiifSpriteAtlas | null>>();
const indexCache = new Map<string, Promise<Map<string, IiifSprite>>>();

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function parseSpriteIndex(spritesByHash: Record<string, IiifSprite>): Map<string, IiifSprite> {
  const spritesByImageServiceUrl = new Map<string, IiifSprite>();
  for (const sprite of Object.values(spritesByHash)) {
    const imageServiceUrl = sprite?.imageId?.replace(/\/+$/, '');
    if (imageServiceUrl) spritesByImageServiceUrl.set(imageServiceUrl, sprite);
  }
  return spritesByImageServiceUrl;
}

async function measureImageSize(url: string): Promise<[number, number] | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const size: [number, number] = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Loads the pre-baked sprite sheet (one shared low-res thumbnail per canvas). Allmaps renders a
 * canvas from this the instant it's triangulated, avoiding a burst of full-resolution IIIF tile
 * fetches (and their WebGL texture uploads) for every canvas the zoom trigger reveals at once;
 * full-res tiles still stream in afterwards, progressively replacing the sprite. Sprites are an
 * optimization — callers should proceed without them (and let Allmaps fetch full-res tiles
 * directly) if this fails or the sublayer has no sprite artifacts.
 *
 * Costly: `measureImageSize` fetches and fully decodes the shared sheet, and every
 * `WarpedMapLayer.addSprites` call using it decodes/uploads that whole sheet again just to crop
 * out the requested sprites (see `apply-sprites-image-data` in `@allmaps/render`). Fine for eager
 * mode (paid once, upfront, for every canvas at once) — avoid it for sequential/viewport-driven
 * loading, where `loadSpriteIndex` + each canvas's own `file` is far cheaper. See `IiifSprite.file`.
 */
export async function loadSpriteAtlas(datasetBaseUrl: string, spritesImagePath: string, spritesIndexPath: string): Promise<IiifSpriteAtlas | null> {
  const cacheKey = `${datasetBaseUrl.replace(/\/+$/, '')}::${spritesImagePath}::${spritesIndexPath}`;
  const cached = atlasCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<IiifSpriteAtlas | null> => {
    const imageUrl = joinUrl(datasetBaseUrl, spritesImagePath);
    const indexUrl = joinUrl(datasetBaseUrl, spritesIndexPath);

    const [imageSize, indexResponse] = await Promise.all([measureImageSize(imageUrl), fetch(indexUrl)]);
    if (!imageSize || !indexResponse.ok) return null;

    const spritesByHash = (await indexResponse.json()) as Record<string, IiifSprite>;
    return { imageUrl, imageSize, spritesByImageServiceUrl: parseSpriteIndex(spritesByHash) };
  })().catch(() => null);

  atlasCache.set(cacheKey, promise);
  return promise;
}

/**
 * Loads just the sprite index (no sheet image fetch/decode) keyed by IIIF image service URL. Use
 * this for sequential/viewport-driven loading: each resolved `IiifSprite.file`, when present, lets
 * the caller upload that one canvas's own small sprite file to Allmaps instead of paying for the
 * whole shared sheet — see `loadSpriteAtlas`'s doc comment for why that matters.
 */
export async function loadSpriteIndex(datasetBaseUrl: string, spritesIndexPath: string): Promise<Map<string, IiifSprite>> {
  const cacheKey = `${datasetBaseUrl.replace(/\/+$/, '')}::${spritesIndexPath}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<Map<string, IiifSprite>> => {
    const indexUrl = joinUrl(datasetBaseUrl, spritesIndexPath);
    const response = await fetch(indexUrl);
    if (!response.ok) return new Map();
    const spritesByHash = (await response.json()) as Record<string, IiifSprite>;
    return parseSpriteIndex(spritesByHash);
  })().catch(() => new Map<string, IiifSprite>());

  indexCache.set(cacheKey, promise);
  return promise;
}
