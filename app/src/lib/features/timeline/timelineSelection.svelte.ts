import type { PaneId } from '$lib/core/map/maplibreInit';
import type { LayerSublayer } from '$lib/core/dataset/layerRegistry';

export type TimelineMode = 'single' | 'compare';

class TimelineSelectionStore {
  mode = $state<TimelineMode>('single');
  leftLayerId = $state<string | null>(null);
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

    const targetPane = this.leftLayerId === null ? 'left' : this.rightLayerId === null ? 'right' : this.nextComparePane;
    if (targetPane === 'left') {
      this.leftLayerId = layerId;
      this.nextComparePane = 'right';
    } else {
      this.rightLayerId = layerId;
      this.nextComparePane = 'left';
    }
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
