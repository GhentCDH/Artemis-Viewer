export interface IiifSprite {
  imageId: string;
  scaleFactor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteTileScale?: number;
}

export interface IiifSpriteAtlas {
  imageUrl: string;
  imageSize: [number, number];
  spritesByImageServiceUrl: Map<string, IiifSprite>;
}

const cache = new Map<string, Promise<IiifSpriteAtlas | null>>();

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
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
 */
export async function loadSpriteAtlas(datasetBaseUrl: string, spritesImagePath: string, spritesIndexPath: string): Promise<IiifSpriteAtlas | null> {
  const cacheKey = `${datasetBaseUrl.replace(/\/+$/, '')}::${spritesImagePath}::${spritesIndexPath}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<IiifSpriteAtlas | null> => {
    const imageUrl = joinUrl(datasetBaseUrl, spritesImagePath);
    const indexUrl = joinUrl(datasetBaseUrl, spritesIndexPath);

    const [imageSize, indexResponse] = await Promise.all([measureImageSize(imageUrl), fetch(indexUrl)]);
    if (!imageSize || !indexResponse.ok) return null;

    const spritesByHash = (await indexResponse.json()) as Record<string, IiifSprite>;
    const spritesByImageServiceUrl = new Map<string, IiifSprite>();
    for (const sprite of Object.values(spritesByHash)) {
      const imageServiceUrl = sprite?.imageId?.replace(/\/+$/, '');
      if (imageServiceUrl) spritesByImageServiceUrl.set(imageServiceUrl, sprite);
    }

    return { imageUrl, imageSize, spritesByImageServiceUrl };
  })().catch(() => null);

  cache.set(cacheKey, promise);
  return promise;
}
