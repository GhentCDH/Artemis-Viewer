import type { SpriteRef } from "$lib/artemis/shared/types";
import { fetchJson, joinUrl } from "$lib/artemis/shared/utils";

export type LayerInfo = {
  sourceCollectionUrl: string;
  sourceCollectionLabel: string;
  compiledCollectionPath?: string;
  map?: string;
  geomapsPath?: string;
  spritesPath?: string;
  grSpritesPath?: string;
  tilesPath?: string;
  tilesMinZoom?: number;
  tilesMaxZoom?: number;
  masksPath?: string;
  renderLayerKey?: string;
  renderLayerLabel?: string;
  hidden?: boolean;
  // ── Data build v2 (layer-oriented registry) ──────────────────────────────────
  // Deploy-relative artifact paths under `Layers/<LayerId>/`, taken verbatim from
  // `layers.yaml` `artifacts`. When present these drive rendering instead of the
  // legacy KNOWN_* path conventions. See datasetV2.ts.
  rasterPmtilesPath?: string;   // artifacts.raster — raster.pmtiles preview pyramid
  spritesImagePath?: string;    // artifacts.sprites — sprites.webp atlas image
  spritesIndexPath?: string;    // artifacts.spritesIndex — sprites.json (flat {hash: sprite})
};

export type TilesConfig = {
  /** Path or URL containing literal `{z}/{x}/{y}` placeholders. */
  template: string;
  minZoom: number;
  maxZoom: number;
};

/** Known pre-warped XYZ tile pyramids (gdal2tiles output) by mapId, keyed until the data
 *  pipeline records this in the geomaps bundle itself (mirrors the gr_sprites convention
 *  fallback below). Directory names aren't derivable from mapId — they vary per pipeline run.
 *
 *  Full z8-12 range (everything the pipeline generates): the raster pyramid is the persistent
 *  base renderer now (Allmaps is loaded lazily only when the user zooms in past the pyramid's
 *  native detail — see `ALLMAPS_TRIGGER_ZOOM` in initialization.ts), so it needs the sharpest
 *  tiles available at whatever zoom the user is actually at, not a single overzoomed level.
 *  MapLibre requests only the handful of tiles intersecting the viewport, so the full range costs
 *  nothing extra at render time. Both collections use identical treatment — no per-layer pinning. */
const KNOWN_TILE_DIRS: Record<string, { dir: string; minZoom: number; maxZoom: number }> = {
  GereduceerdeKadaster: { dir: "GereduceerdeKadaster/Gereduceerd_Kadaster_tiles", minZoom: 8, maxZoom: 12 },
  PrimitiefKadaster: { dir: "PrimitiefKadaster/primitief_kadaster_tiles", minZoom: 8, maxZoom: 12 },
};

/**
 * Resolves the pre-warped raster tile pyramid for a layer, if one exists. Replaces the gr_sprites
 * WebGL placeholder: native MapLibre raster tiles need no manifest fetch, so this can be resolved
 * synchronously from `layerInfo` alone (no geomaps bundle fetch required) and used immediately.
 */
export function resolveTilesConfig(layerInfo: LayerInfo): TilesConfig | undefined {
  const explicitPath = readString(layerInfo.tilesPath);
  if (explicitPath) {
    return {
      template: explicitPath,
      minZoom: Number.isFinite(layerInfo.tilesMinZoom) ? (layerInfo.tilesMinZoom as number) : 0,
      maxZoom: Number.isFinite(layerInfo.tilesMaxZoom) ? (layerInfo.tilesMaxZoom as number) : 22,
    };
  }
  const mapId = readString(layerInfo.map);
  const known = mapId ? KNOWN_TILE_DIRS[mapId] : undefined;
  if (!known) return undefined;
  return { template: `IIIF/${known.dir}/{z}/{x}/{y}.webp`, minZoom: known.minZoom, maxZoom: known.maxZoom };
}

/**
 * Known pre-baked canvas-footprint vector tiles (PMTiles, single "masks" layer, one polygon per
 * canvas with a `manifestUrl` property) by mapId — replaces building clickable canvas outlines
 * from Allmaps' live `geoMask` geometry at runtime. Static data, so unlike Allmaps geoMask it's
 * available the instant the layer's pmtiles source loads, independent of triangulation progress.
 */
const KNOWN_MASK_PMTILES: Record<string, string> = {
  GereduceerdeKadaster: "GereduceerdeKadaster/Gereduceerd_Kadaster_masks.pmtiles",
  PrimitiefKadaster: "PrimitiefKadaster/primitief_kadaster_masks.pmtiles",
};

export function resolveMasksPath(layerInfo: LayerInfo): string | undefined {
  const explicitPath = readString(layerInfo.masksPath);
  if (explicitPath) return explicitPath;
  const mapId = readString(layerInfo.map);
  const known = mapId ? KNOWN_MASK_PMTILES[mapId] : undefined;
  return known ? `IIIF/${known}` : undefined;
}

export type CompiledIndex = {
  renderLayers?: LayerInfo[];
  iiifLayers?: LayerInfo[];
  index: Array<{
    label: string;
    sourceManifestUrl: string;
    sourceCollectionUrl: string;
    isVerzamelblad?: boolean;
    compiledManifestPath: string;
    centerLon?: number;
    centerLat?: number;
  }>;
  domains?: {
    toponyms?: { maps?: string[] };
  };
};

export type CompiledRunnerConfig = {
  datasetBaseUrl: string;
  indexPath?: string;
  fetchTimeoutMs?: number;
};

type RuntimeLayerEntry = {
  label: string;
  sourceManifestUrl: string;
  compiledManifestPath: string;
  isVerzamelblad?: boolean;
  inlineMaps?: Array<{
    url: string;
    raw: unknown;
    canvasAllmapsId?: string;
    imageServiceUrl?: string;
    spriteRef?: SpriteRef;
    placeholderWidth?: number;
    placeholderHeight?: number;
  }>;
  inlineSprites?: Array<{
    imageUrl: string;
    imageSize: [number, number];
    sprite: {
      imageId: string;
      scaleFactor: number;
      x: number;
      y: number;
      width: number;
      height: number;
      spriteTileScale?: number;
    };
  }>;
  manifestAllmapsUrl?: string;
};

type BundleSprite = {
  imageId: string;
  scaleFactor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteTileScale?: number;
};

let cachedIndex: CompiledIndex | null = null;
const cachedNewIiifBundles = new Map<string, Promise<{ entries: RuntimeLayerEntry[]; infoByServiceUrl: Map<string, any>; grSpritesPath?: string }>>();

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveGrSpritesPath(bundle: any, layerInfo: LayerInfo): string | undefined {
  const bundleSprites = bundle?.sprites;
  const explicitPath =
    readString(layerInfo.grSpritesPath) ??
    readString(bundleSprites?.grJson) ??
    readString(bundleSprites?.georeferencedJson) ??
    readString(bundleSprites?.warpedJson);

  if (explicitPath) return explicitPath;

  const mapId = readString(bundle?.mapId) ?? readString(layerInfo.map);
  if (mapId === "GereduceerdeKadaster" || mapId === "PrimitiefKadaster") {
    return `IIIF/${mapId}/sprites/gr_sprites.json`;
  }

  return undefined;
}

export function resetBundleLoaderCache() {
  cachedIndex = null;
  cachedNewIiifBundles.clear();
}

export async function loadCompiledIndex(cfg: CompiledRunnerConfig): Promise<CompiledIndex> {
  if (cachedIndex) return cachedIndex;
  const indexUrl = joinUrl(cfg.datasetBaseUrl, cfg.indexPath ?? "index.json");
  const index = await fetchJson<CompiledIndex>(indexUrl, cfg.fetchTimeoutMs ?? 30000);
  cachedIndex = index;
  return index;
}

/** True for a Data-build-v2 compact geomaps bundle (`geomapsVersion: 1`): a flat per-canvas
 *  `maps[]` with top-level `baseImageUrl`, rather than the legacy `maps[].canvases[].georeferencedMap`
 *  nesting. Detected from the payload so the caller need not thread a mode flag. */
function isV2GeomapsBundle(bundle: any): boolean {
  if (!bundle || typeof bundle !== "object") return false;
  if (typeof bundle.geomapsVersion === "number") return true;
  const first = Array.isArray(bundle.maps) ? bundle.maps[0] : undefined;
  return Boolean(first && !("canvases" in first) && Array.isArray(first.gcps));
}

/** `[x,y,lon,lat, …]`-flat GCPs → Allmaps `{resource:[x,y], geo:[lon,lat]}[]`. */
function toAllmapsGcps(flat: unknown): Array<{ resource: [number, number]; geo: [number, number] }> {
  if (!Array.isArray(flat)) return [];
  const out: Array<{ resource: [number, number]; geo: [number, number] }> = [];
  for (const g of flat) {
    if (!Array.isArray(g) || g.length < 4) continue;
    out.push({ resource: [Number(g[0]), Number(g[1])], geo: [Number(g[2]), Number(g[3])] });
  }
  return out;
}

/** `[x,y,x,y, …]`-flat mask → Allmaps polygon `[[x,y], …]`. */
function toAllmapsResourceMask(flat: unknown): Array<[number, number]> {
  if (!Array.isArray(flat)) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([Number(flat[i]), Number(flat[i + 1])]);
  return out;
}

/** Measure a sprite atlas's pixel dimensions (v2 sprites.json carries no imageSize metadata). */
async function measureImageSize(url: string): Promise<[number, number] | null> {
  if (typeof createImageBitmap !== "function" || typeof fetch !== "function") return null;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const size: [number, number] = [bmp.width, bmp.height];
    bmp.close?.();
    return size;
  } catch {
    return null;
  }
}

/**
 * Map a Data-build-v2 compact geomaps bundle into the runtime entry shape. Each flat `maps[]`
 * element is one canvas; the Allmaps `GeoreferencedMap` is reconstructed per element, and sprites
 * (a separate `sprites.webp` + flat `sprites.json` keyed by opaque hashes) are joined by full image
 * service URL — `sprite.imageId === baseImageUrl + map.imageId`. See DATA_BUILD_V2_MIGRATION_PLAN.md.
 */
async function mapV2GeomapsBundle(
  cfg: CompiledRunnerConfig,
  layerInfo: LayerInfo,
  bundle: any,
  geomapsUrl: string,
  timeout: number,
  spriteDebugMode: boolean
): Promise<{ entries: RuntimeLayerEntry[]; infoByServiceUrl: Map<string, any>; grSpritesPath?: string }> {
  const maps = (bundle?.maps ?? []) as any[];
  const baseImageUrl = readString(bundle?.baseImageUrl) ?? "";
  const iiifDefaults = bundle?.iiifDefaults;
  const entries: RuntimeLayerEntry[] = [];
  const infoByServiceUrl = new Map<string, any>();

  const toServiceUrl = (imageId: string): string =>
    (/^https?:\/\//i.test(imageId) ? imageId : `${baseImageUrl}${imageId}`).replace(/\/+$/, "");

  // ── Sprites: separate atlas image + flat {hash: sprite} index, joined by full image URL. ──────
  const spritesByServiceUrl = new Map<string, BundleSprite>();
  let spriteImageUrl = "";
  let spriteImageSize: [number, number] | null = null;
  const spritesImagePath = readString(layerInfo.spritesImagePath);
  const spritesIndexPath = readString(layerInfo.spritesIndexPath);
  if (spritesImagePath && spritesIndexPath) {
    spriteImageUrl = joinUrl(
      cfg.datasetBaseUrl,
      spriteDebugMode ? spritesImagePath.replace(/(\.[^.]+)$/, "_debug$1") : spritesImagePath
    );
    try {
      const spritesUrl = joinUrl(cfg.datasetBaseUrl, spritesIndexPath);
      const [spritesJson, measured] = await Promise.all([
        fetchJson<Record<string, BundleSprite>>(spritesUrl, timeout),
        measureImageSize(spriteImageUrl),
      ]);
      spriteImageSize = measured;
      for (const sprite of Object.values(spritesJson ?? {})) {
        const key = readString(sprite?.imageId);
        if (key) spritesByServiceUrl.set(key.replace(/\/+$/, ""), sprite);
      }
    } catch {
      // sprites are an optimization — proceed without them (Allmaps fetches full-res IIIF tiles)
    }
  }

  for (const map of maps) {
    const imageId = String(map?.imageId ?? map?.id ?? "").trim();
    if (!imageId) continue;
    const imageServiceUrl = toServiceUrl(imageId);
    const label = String(map?.label ?? map?.id ?? imageId).trim();
    const width = Number(map?.width) || undefined;
    const height = Number(map?.height) || undefined;

    // IIIF info: prefer the per-map IIIF-3 override wholesale (it does NOT shallow-merge cleanly
    // with the IIIF-2 defaults — different @context/profile shape); fall back to bundle defaults.
    const info = { ...(map?.iiifOverrides ?? iiifDefaults ?? {}), id: imageServiceUrl, "@id": imageServiceUrl };
    if (width) info.width = width;
    if (height) info.height = height;
    infoByServiceUrl.set(imageServiceUrl, info);

    const resourceType = map?.iiifOverrides ? "ImageService3" : "ImageService2";
    const raw = {
      "@context": "https://schemas.allmaps.org/map/2/context.json",
      type: "GeoreferencedMap",
      resource: { id: imageServiceUrl, type: resourceType, width, height },
      gcps: toAllmapsGcps(map?.gcps),
      resourceMask: toAllmapsResourceMask(map?.resourceMask),
      transformation: { type: readString(map?.transformation) ?? "polynomial1" },
    };

    const sprite = spritesByServiceUrl.get(imageServiceUrl);
    const spriteRef =
      sprite && spriteImageSize && spriteImageUrl
        ? {
            sheetUrl: spriteImageUrl,
            sheetWidth: spriteImageSize[0],
            sheetHeight: spriteImageSize[1],
            x: sprite.x,
            y: sprite.y,
            width: sprite.width,
            height: sprite.height,
          }
        : undefined;

    entries.push({
      label,
      sourceManifestUrl: imageServiceUrl,
      compiledManifestPath: imageServiceUrl,
      isVerzamelblad: false,
      inlineMaps: [{
        url: `${geomapsUrl}#${encodeURIComponent(imageId)}`,
        raw,
        canvasAllmapsId: undefined,
        imageServiceUrl,
        spriteRef,
        placeholderWidth: width,
        placeholderHeight: height,
      }],
      inlineSprites:
        sprite && spriteImageSize && spriteImageUrl
          ? [{ imageUrl: spriteImageUrl, imageSize: spriteImageSize, sprite }]
          : [],
      manifestAllmapsUrl: readString(layerInfo.sourceCollectionUrl),
    });
  }

  return { entries, infoByServiceUrl, grSpritesPath: undefined };
}

export async function loadNewIiifEntries(
  cfg: CompiledRunnerConfig,
  layerInfo: LayerInfo,
  timeout: number,
  spriteDebugMode = false
): Promise<{ entries: RuntimeLayerEntry[]; infoByServiceUrl: Map<string, any>; grSpritesPath?: string }> {
  const cacheKey = [cfg.datasetBaseUrl.replace(/\/+$/, ""), layerInfo.geomapsPath, layerInfo.grSpritesPath ?? ""].join("::");
  const cached = cachedNewIiifBundles.get(cacheKey);
  if (cached) return cached;

  const bundlePromise = (async () => {
    const geomapsUrl = joinUrl(cfg.datasetBaseUrl, layerInfo.geomapsPath!);
    const bundle = await fetchJson<any>(geomapsUrl, timeout);
    if (isV2GeomapsBundle(bundle)) {
      return mapV2GeomapsBundle(cfg, layerInfo, bundle, geomapsUrl, timeout, spriteDebugMode);
    }
    const maps = (bundle?.maps ?? []) as any[];
    const entries: RuntimeLayerEntry[] = [];
    const infoByServiceUrl = new Map<string, any>();
    const bundleSprites = bundle?.sprites;
    const spriteImageSize =
      Array.isArray(bundleSprites?.imageSize) && bundleSprites.imageSize.length === 2
        ? [Number(bundleSprites.imageSize[0]), Number(bundleSprites.imageSize[1])] as [number, number]
        : null;
    const spritePath = typeof bundleSprites?.image === "string" ? String(bundleSprites.image) : "";
    const spriteJsonPath = typeof bundleSprites?.json === "string" ? String(bundleSprites.json) : "";
    const grSpritesPath = resolveGrSpritesPath(bundle, layerInfo);
    const spriteImageUrl = spritePath
      ? joinUrl(cfg.datasetBaseUrl, spriteDebugMode ? spritePath.replace(/(\.[^.]+)$/, "_debug$1") : spritePath)
      : "";
    const spritesByCanvasAllmapsId = new Map<string, BundleSprite>();

    if (spriteJsonPath) {
      const spritesUrl = joinUrl(cfg.datasetBaseUrl, spriteJsonPath);
      const sprites = await fetchJson<Record<string, BundleSprite>>(spritesUrl, timeout);
      for (const [canvasAllmapsId, sprite] of Object.entries(sprites)) {
        const key = String(canvasAllmapsId).trim();
        if (!key || !sprite) continue;
        spritesByCanvasAllmapsId.set(key, sprite);
      }
    }

    for (const map of maps) {
      const sourceManifestUrl = String(map.id ?? "").trim();
      const label = String(map.label ?? sourceManifestUrl).trim();
      const canvases = Array.isArray(map.canvases) ? map.canvases : [];

      const inlineMaps = canvases.flatMap((canvas: any) => {
        if (!canvas.georeferencedMap) return [];
        const canvasAllmapsId = String(canvas?.canvasAllmapsId ?? "").trim();
        const imageServiceUrl = String(canvas?.info?.["@id"] ?? canvas?.info?.id ?? "").replace(/\/+$/, "") || undefined;
        const sprite = canvasAllmapsId ? spritesByCanvasAllmapsId.get(canvasAllmapsId) : undefined;
        const spriteRef =
          sprite && spriteImageSize && spriteImageUrl
            ? {
                sheetUrl: spriteImageUrl,
                sheetWidth: spriteImageSize[0],
                sheetHeight: spriteImageSize[1],
                x: sprite.x,
                y: sprite.y,
                width: sprite.width,
                height: sprite.height,
              }
            : undefined;
        const placeholderWidth = Number(canvas?.info?.width ?? canvas?.georeferencedMap?.resource?.width ?? 0);
        const placeholderHeight = Number(canvas?.info?.height ?? canvas?.georeferencedMap?.resource?.height ?? 0);
        return [{
          url: `${geomapsUrl}#${encodeURIComponent(canvas.id)}`,
          raw: canvas.georeferencedMap,
          canvasAllmapsId: canvasAllmapsId || undefined,
          imageServiceUrl,
          spriteRef,
          placeholderWidth: Number.isFinite(placeholderWidth) && placeholderWidth > 0 ? placeholderWidth : undefined,
          placeholderHeight: Number.isFinite(placeholderHeight) && placeholderHeight > 0 ? placeholderHeight : undefined,
        }];
      });

      const inlineSprites = canvases.flatMap((canvas: any) => {
        const canvasAllmapsId = String(canvas?.canvasAllmapsId ?? "").trim();
        const sprite = canvasAllmapsId ? spritesByCanvasAllmapsId.get(canvasAllmapsId) : undefined;
        if (!sprite || !spriteImageSize || !spriteImageUrl) return [];
        return [{
          imageUrl: spriteImageUrl,
          imageSize: spriteImageSize,
          sprite,
        }];
      });

      if (inlineMaps.length === 0) continue;

      for (const canvas of canvases) {
        if (canvas.info) {
          const serviceUrl = String(canvas.info["@id"] ?? canvas.info.id ?? "").replace(/\/+$/, "");
          if (serviceUrl) infoByServiceUrl.set(serviceUrl, canvas.info);
        }
      }

      const firstMap = inlineMaps[0]?.raw as any;
      const manifestPartOf = firstMap?.resource?.partOf?.[0]?.partOf?.[0];
      const manifestAllmapsUrl = typeof manifestPartOf?.id === "string" ? manifestPartOf.id : undefined;

      entries.push({
        label,
        sourceManifestUrl,
        compiledManifestPath: sourceManifestUrl || `${layerInfo.geomapsPath}#${encodeURIComponent(label)}`,
        isVerzamelblad: map.isVerzamelblad ?? false,
        inlineMaps,
        inlineSprites,
        manifestAllmapsUrl,
      });
    }

    return { entries, infoByServiceUrl, grSpritesPath };
  })().catch((err) => {
    cachedNewIiifBundles.delete(cacheKey);
    throw err;
  });

  cachedNewIiifBundles.set(cacheKey, bundlePromise);
  return bundlePromise;
}
