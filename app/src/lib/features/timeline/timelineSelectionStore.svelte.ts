import type { PaneId } from '$lib/core/map/maplibreInit';
import type { LayerSublayer } from '$lib/core/dataset/layerRegistry';

export type TimelineMode = 'single' | 'compare';
export const DEFAULT_TIMELINE_LAYER_ID = 'GereduceerdeKadaster';

class TimelineSelectionStore {
  mode = $state<TimelineMode>('single');
  paneLayerIds = $state<Record<PaneId, string | null>>({ left: DEFAULT_TIMELINE_LAYER_ID, right: null });
  nextComparePane = $state<PaneId>('left');
  sublayersByLayerId = $state<Record<string, Record<string, boolean>>>({});

  get activeLayerIds(): string[] {
    const ids =
      this.mode === 'compare' ? [this.paneLayerIds.left, this.paneLayerIds.right] : [this.paneLayerIds.left];
    return ids.filter((layerId): layerId is string => layerId !== null);
  }

  isLayerActive(layerId: string): boolean {
    return this.paneOf(layerId) !== null;
  }

  private paneOf(layerId: string): PaneId | null {
    return this.paneLayerIds.left === layerId ? 'left' : this.paneLayerIds.right === layerId ? 'right' : null;
  }

  private nextTargetPane(): PaneId {
    return this.paneLayerIds.left === null ? 'left' : this.paneLayerIds.right === null ? 'right' : this.nextComparePane;
  }

  private activateInPane(layerId: string, pane: PaneId): void {
    this.paneLayerIds[pane] = layerId;
    this.nextComparePane = pane === 'left' ? 'right' : 'left';
  }

  toggleLayer(layerId: string): void {
    if (this.mode === 'single') {
      this.paneLayerIds = { left: this.paneLayerIds.left === layerId ? null : layerId, right: null };
      this.nextComparePane = 'left';
      return;
    }

    const activePane = this.paneOf(layerId);
    if (activePane !== null) {
      this.clearPane(activePane);
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
    const activePane = this.paneOf(layerId);
    if (activePane !== null) return activePane;

    if (this.mode === 'single') {
      this.paneLayerIds.left = layerId;
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
    this.paneLayerIds = { left: state.leftLayerId, right: state.rightLayerId };
    this.nextComparePane =
      state.leftLayerId === null ? 'left' : state.rightLayerId === null ? 'right' : 'left';
  }

  clearPane(paneId: PaneId): void {
    this.paneLayerIds[paneId] = null;
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
