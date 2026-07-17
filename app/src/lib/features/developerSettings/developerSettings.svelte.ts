import { DATASET_SOURCE_STORAGE_KEY, type DatasetSource } from '$lib/core/dataset/dataSource';
import type {
  AllmapsRenderOptions,
  AllmapsTransformation,
  AllmapsTuningOptions,
  IiifLoadingMode,
} from '$lib/core/renderers/types';

const STORAGE_KEY = 'artemis.developer-settings.v1';

interface PersistedDeveloperSettings {
  transformation: AllmapsTransformation;
  debugTriangles: boolean;
  debugTiles: boolean;
  showHighStretch: boolean;
  iiifLoadingMode: IiifLoadingMode;
  allmapsDiagnostics: boolean;
  allmapsTileCacheLog: boolean;
  allmapsTextureLog: boolean;
  allmapsPboLog: boolean;
  allmapsSprites: boolean;
  dataSource: DatasetSource;
  allmapsTuning: AllmapsTuningOptions;
}

// Mirrors the tuned WarpedMapLayer constructor values in allmapsWarpRenderer (which documents
// the trade-offs), so default settings reproduce the shipped rendering behaviour exactly.
export const ALLMAPS_TUNING_DEFAULTS: AllmapsTuningOptions = {
  log2ScaleFactorCorrection: 0,
  pruneViewportBufferRatio: 2,
  overviewRequestViewportBufferRatio: 2,
  overviewPruneViewportBufferRatio: 4,
  maxTotalOverviewResolutionRatio: 0,
  overviewTilesMaxResolution: undefined,
  overviewTilesSelection: 'lowest',
};

const DEFAULTS: PersistedDeveloperSettings = {
  transformation: 'polynomial1',
  debugTriangles: false,
  debugTiles: false,
  showHighStretch: false,
  iiifLoadingMode: 'sequential',
  allmapsDiagnostics: false,
  allmapsTileCacheLog: false,
  allmapsTextureLog: false,
  allmapsPboLog: false,
  allmapsSprites: true,
  dataSource: 'published',
  allmapsTuning: ALLMAPS_TUNING_DEFAULTS,
};

function sanitizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeTuning(raw: Partial<AllmapsTuningOptions> | undefined): AllmapsTuningOptions {
  const defaults = ALLMAPS_TUNING_DEFAULTS;
  return {
    log2ScaleFactorCorrection: sanitizeNumber(raw?.log2ScaleFactorCorrection, defaults.log2ScaleFactorCorrection),
    pruneViewportBufferRatio: sanitizeNumber(raw?.pruneViewportBufferRatio, defaults.pruneViewportBufferRatio),
    overviewRequestViewportBufferRatio: sanitizeNumber(raw?.overviewRequestViewportBufferRatio, defaults.overviewRequestViewportBufferRatio),
    overviewPruneViewportBufferRatio: sanitizeNumber(raw?.overviewPruneViewportBufferRatio, defaults.overviewPruneViewportBufferRatio),
    maxTotalOverviewResolutionRatio: sanitizeNumber(raw?.maxTotalOverviewResolutionRatio, defaults.maxTotalOverviewResolutionRatio),
    overviewTilesMaxResolution:
      typeof raw?.overviewTilesMaxResolution === 'number' && Number.isFinite(raw.overviewTilesMaxResolution)
        ? raw.overviewTilesMaxResolution
        : undefined,
    overviewTilesSelection: raw?.overviewTilesSelection === 'highest' ? 'highest' : 'lowest',
  };
}

function tuningEquals(a: AllmapsTuningOptions, b: AllmapsTuningOptions): boolean {
  return (
    a.log2ScaleFactorCorrection === b.log2ScaleFactorCorrection &&
    a.pruneViewportBufferRatio === b.pruneViewportBufferRatio &&
    a.overviewRequestViewportBufferRatio === b.overviewRequestViewportBufferRatio &&
    a.overviewPruneViewportBufferRatio === b.overviewPruneViewportBufferRatio &&
    a.maxTotalOverviewResolutionRatio === b.maxTotalOverviewResolutionRatio &&
    a.overviewTilesMaxResolution === b.overviewTilesMaxResolution &&
    a.overviewTilesSelection === b.overviewTilesSelection
  );
}

function readPersistedSettings(): PersistedDeveloperSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PersistedDeveloperSettings>;
    return {
      transformation: raw.transformation === 'thinPlateSpline' ? 'thinPlateSpline' : 'polynomial1',
      debugTriangles: raw.debugTriangles === true,
      debugTiles: raw.debugTiles === true,
      showHighStretch: raw.showHighStretch === true,
      iiifLoadingMode: raw.iiifLoadingMode === 'eager' ? 'eager' : 'sequential',
      allmapsDiagnostics: raw.allmapsDiagnostics === true,
      allmapsTileCacheLog: raw.allmapsTileCacheLog === true,
      allmapsTextureLog: raw.allmapsTextureLog === true,
      allmapsPboLog: raw.allmapsPboLog === true,
      allmapsSprites: raw.allmapsSprites !== false,
      dataSource:
        raw.dataSource === 'draft' || window.localStorage.getItem(DATASET_SOURCE_STORAGE_KEY) === 'draft'
          ? 'draft'
          : 'published',
      allmapsTuning: sanitizeTuning(raw.allmapsTuning),
    };
  } catch {
    return DEFAULTS;
  }
}

class DeveloperSettingsStore {
  transformation = $state<AllmapsTransformation>(DEFAULTS.transformation);
  debugTriangles = $state(DEFAULTS.debugTriangles);
  debugTiles = $state(DEFAULTS.debugTiles);
  showHighStretch = $state(DEFAULTS.showHighStretch);
  iiifLoadingMode = $state<IiifLoadingMode>(DEFAULTS.iiifLoadingMode);
  allmapsDiagnostics = $state(DEFAULTS.allmapsDiagnostics);
  allmapsTileCacheLog = $state(DEFAULTS.allmapsTileCacheLog);
  allmapsTextureLog = $state(DEFAULTS.allmapsTextureLog);
  allmapsPboLog = $state(DEFAULTS.allmapsPboLog);
  allmapsSprites = $state(DEFAULTS.allmapsSprites);
  dataSource = $state<DatasetSource>(DEFAULTS.dataSource);
  allmapsTuning = $state<AllmapsTuningOptions>(DEFAULTS.allmapsTuning);
  renderRevision = $state(0);

  constructor() {
    const persisted = readPersistedSettings();
    this.transformation = persisted.transformation;
    this.debugTriangles = persisted.debugTriangles;
    this.debugTiles = persisted.debugTiles;
    this.showHighStretch = persisted.showHighStretch;
    this.iiifLoadingMode = persisted.iiifLoadingMode;
    this.allmapsDiagnostics = persisted.allmapsDiagnostics;
    this.allmapsTileCacheLog = persisted.allmapsTileCacheLog;
    this.allmapsTextureLog = persisted.allmapsTextureLog;
    this.allmapsPboLog = persisted.allmapsPboLog;
    this.allmapsSprites = persisted.allmapsSprites;
    this.dataSource = persisted.dataSource;
    this.allmapsTuning = persisted.allmapsTuning;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DATASET_SOURCE_STORAGE_KEY, persisted.dataSource);
    }
  }

  get allmapsOptions(): AllmapsRenderOptions {
    return {
      transformationType: this.transformation,
      debugTriangles: this.debugTriangles,
      debugTiles: this.debugTiles,
      showHighStretch: this.showHighStretch,
      loadingMode: this.iiifLoadingMode,
      diagnostics: this.allmapsDiagnostics,
      tileCacheLog: this.allmapsTileCacheLog,
      textureLog: this.allmapsTextureLog,
      pboLog: this.allmapsPboLog,
      spritesEnabled: this.allmapsSprites,
      tuning: this.allmapsTuning,
    };
  }

  setTransformation(value: AllmapsTransformation): void {
    if (this.transformation === value) return;
    this.transformation = value;
    this.renderRevision += 1;
    this.persist();
  }

  setDebugTriangles(value: boolean): void {
    if (this.debugTriangles === value) return;
    this.debugTriangles = value;
    this.renderRevision += 1;
    this.persist();
  }

  setDebugTiles(value: boolean): void {
    if (this.debugTiles === value) return;
    this.debugTiles = value;
    this.renderRevision += 1;
    this.persist();
  }

  setShowHighStretch(value: boolean): void {
    if (this.showHighStretch === value) return;
    this.showHighStretch = value;
    this.renderRevision += 1;
    this.persist();
  }

  setIiifLoadingMode(value: IiifLoadingMode): void {
    if (this.iiifLoadingMode === value) return;
    this.iiifLoadingMode = value;
    this.persist();
    if (typeof window !== 'undefined') window.location.reload();
  }

  setAllmapsDiagnostics(value: boolean): void {
    if (this.allmapsDiagnostics === value) return;
    this.allmapsDiagnostics = value;
    this.renderRevision += 1;
    this.persist();
  }

  setAllmapsTileCacheLog(value: boolean): void {
    if (this.allmapsTileCacheLog === value) return;
    this.allmapsTileCacheLog = value;
    this.renderRevision += 1;
    this.persist();
  }

  setAllmapsTextureLog(value: boolean): void {
    if (this.allmapsTextureLog === value) return;
    this.allmapsTextureLog = value;
    this.renderRevision += 1;
    this.persist();
  }

  setAllmapsPboLog(value: boolean): void {
    if (this.allmapsPboLog === value) return;
    this.allmapsPboLog = value;
    this.renderRevision += 1;
    this.persist();
  }

  setAllmapsSprites(value: boolean): void {
    if (this.allmapsSprites === value) return;
    this.allmapsSprites = value;
    this.renderRevision += 1;
    this.persist();
  }

  setAllmapsTuning(patch: Partial<AllmapsTuningOptions>): void {
    const next = sanitizeTuning({ ...this.allmapsTuning, ...patch });
    if (tuningEquals(this.allmapsTuning, next)) return;
    this.allmapsTuning = next;
    this.renderRevision += 1;
    this.persist();
  }

  setDataSource(value: DatasetSource): void {
    if (this.dataSource === value) return;
    this.dataSource = value;
    this.persist();
    if (typeof window !== 'undefined') window.location.reload();
  }

  resetDefaults(): void {
    const renderingChanged =
      this.transformation !== DEFAULTS.transformation ||
      this.debugTriangles !== DEFAULTS.debugTriangles ||
      this.debugTiles !== DEFAULTS.debugTiles ||
      this.showHighStretch !== DEFAULTS.showHighStretch ||
      this.allmapsSprites !== DEFAULTS.allmapsSprites ||
      !tuningEquals(this.allmapsTuning, DEFAULTS.allmapsTuning);
    const loadingModeChanged = this.iiifLoadingMode !== DEFAULTS.iiifLoadingMode;
    const diagnosticsChanged =
      this.allmapsDiagnostics !== DEFAULTS.allmapsDiagnostics ||
      this.allmapsTileCacheLog !== DEFAULTS.allmapsTileCacheLog ||
      this.allmapsTextureLog !== DEFAULTS.allmapsTextureLog ||
      this.allmapsPboLog !== DEFAULTS.allmapsPboLog;
    const dataSourceChanged = this.dataSource !== DEFAULTS.dataSource;

    this.transformation = DEFAULTS.transformation;
    this.debugTriangles = DEFAULTS.debugTriangles;
    this.debugTiles = DEFAULTS.debugTiles;
    this.showHighStretch = DEFAULTS.showHighStretch;
    this.iiifLoadingMode = DEFAULTS.iiifLoadingMode;
    this.allmapsDiagnostics = DEFAULTS.allmapsDiagnostics;
    this.allmapsTileCacheLog = DEFAULTS.allmapsTileCacheLog;
    this.allmapsTextureLog = DEFAULTS.allmapsTextureLog;
    this.allmapsPboLog = DEFAULTS.allmapsPboLog;
    this.allmapsSprites = DEFAULTS.allmapsSprites;
    this.dataSource = DEFAULTS.dataSource;
    this.allmapsTuning = DEFAULTS.allmapsTuning;
    if (renderingChanged || loadingModeChanged || diagnosticsChanged) this.renderRevision += 1;
    this.persist();

    if (dataSourceChanged && typeof window !== 'undefined') window.location.reload();
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    const settings: PersistedDeveloperSettings = {
      transformation: this.transformation,
      debugTriangles: this.debugTriangles,
      debugTiles: this.debugTiles,
      showHighStretch: this.showHighStretch,
      iiifLoadingMode: this.iiifLoadingMode,
      allmapsDiagnostics: this.allmapsDiagnostics,
      allmapsTileCacheLog: this.allmapsTileCacheLog,
      allmapsTextureLog: this.allmapsTextureLog,
      allmapsPboLog: this.allmapsPboLog,
      allmapsSprites: this.allmapsSprites,
      dataSource: this.dataSource,
      allmapsTuning: this.allmapsTuning,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.setItem(DATASET_SOURCE_STORAGE_KEY, this.dataSource);
  }
}

export const developerSettings = new DeveloperSettingsStore();
