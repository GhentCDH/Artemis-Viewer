import type { PaneId } from '$lib/core/map/maplibreInit';
import type { LayerSublayer } from '$lib/core/dataset/layerRegistry';

export type TimelineMode = 'single' | 'compare';
export const DEFAULT_TIMELINE_LAYER_ID = 'GereduceerdeKadaster';

class TimelineSelectionStore {
  mode = $state<TimelineMode>('single');
  leftLayerId = $state<string | null>(DEFAULT_TIMELINE_LAYER_ID);
  rightLayerId = $state<string | null>(null);
  nextComparePane = $state<PaneId>('left');
  sublayersByLayerId = $state<Record<string, Record<string, boolean>>>({});

  get activeLayerIds(): string[] {
    const ids = this.mode === 'compare' ? [this.leftLayerId, this.rightLayerId] : [this.leftLayerId];
    return ids.filter((layerId): layerId is string => layerId !== null);
  }

  isLayerActive(layerId: string): boolean {
    return this.leftLayerId === layerId || this.rightLayerId === layerId;
  }

  private nextTargetPane(): PaneId {
    return this.leftLayerId === null ? 'left' : this.rightLayerId === null ? 'right' : this.nextComparePane;
  }

  private activateInPane(layerId: string, pane: PaneId): void {
    if (pane === 'left') {
      this.leftLayerId = layerId;
      this.nextComparePane = 'right';
    } else {
      this.rightLayerId = layerId;
      this.nextComparePane = 'left';
    }
  }

  toggleLayer(layerId: string): void {
    if (this.mode === 'single') {
      this.leftLayerId = this.leftLayerId === layerId ? null : layerId;
      this.rightLayerId = null;
      this.nextComparePane = 'left';
      return;
    }

    if (this.leftLayerId === layerId) {
      this.leftLayerId = null;
      this.nextComparePane = 'left';
      return;
    }

    if (this.rightLayerId === layerId) {
      this.rightLayerId = null;
      this.nextComparePane = 'right';
      return;
    }

    this.activateInPane(layerId, this.nextTargetPane());
  }

  /**
   * Activates a layer without deactivating it if it's already on (unlike toggleLayer),
   * and reports which pane it ended up in — used by search to fly the matching pane's
   * camera to the selected result.
   */
  focusLayer(layerId: string): PaneId {
    if (this.leftLayerId === layerId) return 'left';
    if (this.rightLayerId === layerId) return 'right';

    if (this.mode === 'single') {
      this.leftLayerId = layerId;
      this.nextComparePane = 'left';
      return 'left';
    }

    const pane = this.nextTargetPane();
    this.activateInPane(layerId, pane);
    return pane;
  }

  setMode(mode: TimelineMode): void {
    this.mode = mode;
    if (mode === 'single') {
      this.nextComparePane = 'left';
    }
  }

  toggleCompareMode(): void {
    this.setMode(this.mode === 'compare' ? 'single' : 'compare');
  }

  restorePersistentState(state: {
    mode: TimelineMode;
    leftLayerId: string | null;
    rightLayerId: string | null;
  }): void {
    this.mode = state.mode;
    this.leftLayerId = state.leftLayerId;
    this.rightLayerId = state.rightLayerId;
    this.nextComparePane =
      state.leftLayerId === null ? 'left' : state.rightLayerId === null ? 'right' : 'left';
  }

  clearPane(paneId: PaneId): void {
    if (paneId === 'left') {
      this.leftLayerId = null;
    } else {
      this.rightLayerId = null;
    }
    this.nextComparePane = paneId;
  }

  ensureSublayerDefaults(layerId: string, sublayers: LayerSublayer[]): void {
    const currentLayerState = this.sublayersByLayerId[layerId] ?? {};
    let changed = this.sublayersByLayerId[layerId] == null;
    const nextLayerState = { ...currentLayerState };

    for (const [index, sublayer] of sublayers.entries()) {
      if (nextLayerState[sublayer.id] == null) {
        nextLayerState[sublayer.id] = index === 0;
        changed = true;
      }
    }

    if (changed) {
      this.sublayersByLayerId = {
        ...this.sublayersByLayerId,
        [layerId]: nextLayerState,
      };
    }
  }

  isSublayerEnabled(layerId: string, sublayerId: string): boolean {
    return this.sublayersByLayerId[layerId]?.[sublayerId] ?? false;
  }

  toggleSublayer(layerId: string, sublayerId: string): void {
    const layerState = this.sublayersByLayerId[layerId] ?? {};
    this.sublayersByLayerId = {
      ...this.sublayersByLayerId,
      [layerId]: {
        ...layerState,
        [sublayerId]: !layerState[sublayerId],
      },
    };
  }
}

export const timelineSelection = new TimelineSelectionStore();
