import { DATASET_SOURCE_STORAGE_KEY, type DatasetSource } from '$lib/core/dataset/dataSource';
import type { AllmapsRenderOptions, AllmapsTransformation } from '$lib/core/renderers/types';

const STORAGE_KEY = 'artemis.developer-settings.v1';

interface PersistedDeveloperSettings {
  transformation: AllmapsTransformation;
  debugTriangles: boolean;
  showHighStretch: boolean;
  dataSource: DatasetSource;
}

const DEFAULTS: PersistedDeveloperSettings = {
  transformation: 'polynomial1',
  debugTriangles: false,
  showHighStretch: false,
  dataSource: 'published',
};

function readPersistedSettings(): PersistedDeveloperSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PersistedDeveloperSettings>;
    return {
      transformation: raw.transformation === 'thinPlateSpline' ? 'thinPlateSpline' : 'polynomial1',
      debugTriangles: raw.debugTriangles === true,
      showHighStretch: raw.showHighStretch === true,
      dataSource:
        raw.dataSource === 'draft' || window.localStorage.getItem(DATASET_SOURCE_STORAGE_KEY) === 'draft'
          ? 'draft'
          : 'published',
    };
  } catch {
    return DEFAULTS;
  }
}

class DeveloperSettingsStore {
  transformation = $state<AllmapsTransformation>(DEFAULTS.transformation);
  debugTriangles = $state(DEFAULTS.debugTriangles);
  showHighStretch = $state(DEFAULTS.showHighStretch);
  dataSource = $state<DatasetSource>(DEFAULTS.dataSource);
  renderRevision = $state(0);

  constructor() {
    const persisted = readPersistedSettings();
    this.transformation = persisted.transformation;
    this.debugTriangles = persisted.debugTriangles;
    this.showHighStretch = persisted.showHighStretch;
    this.dataSource = persisted.dataSource;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DATASET_SOURCE_STORAGE_KEY, persisted.dataSource);
    }
  }

  get allmapsOptions(): AllmapsRenderOptions {
    return {
      transformationType: this.transformation,
      debugTriangles: this.debugTriangles,
      showHighStretch: this.showHighStretch,
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

  setShowHighStretch(value: boolean): void {
    if (this.showHighStretch === value) return;
    this.showHighStretch = value;
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
      this.showHighStretch !== DEFAULTS.showHighStretch;
    const dataSourceChanged = this.dataSource !== DEFAULTS.dataSource;

    this.transformation = DEFAULTS.transformation;
    this.debugTriangles = DEFAULTS.debugTriangles;
    this.showHighStretch = DEFAULTS.showHighStretch;
    this.dataSource = DEFAULTS.dataSource;
    if (renderingChanged) this.renderRevision += 1;
    this.persist();

    if (dataSourceChanged && typeof window !== 'undefined') window.location.reload();
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    const settings: PersistedDeveloperSettings = {
      transformation: this.transformation,
      debugTriangles: this.debugTriangles,
      showHighStretch: this.showHighStretch,
      dataSource: this.dataSource,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.setItem(DATASET_SOURCE_STORAGE_KEY, this.dataSource);
  }
}

export const developerSettings = new DeveloperSettingsStore();
