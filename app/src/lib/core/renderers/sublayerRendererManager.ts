import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
import { canRenderPmVectorSublayer, renderPmVectorSublayer, removePmVectorSublayer } from './pmVectorRenderer';
import { canRenderRemoteSublayer, renderRemoteSublayer, removeRemoteSublayer } from './remoteRenderer';
import type { SublayerRenderContext } from './types';

export interface SublayerRendererState {
  activeLayerIds: string[];
  sublayersByLayerId: Record<string, Record<string, boolean>>;
}

export class SublayerRendererManager {
  private readonly context: SublayerRenderContext;
  private readonly renderedRemoteSublayerIds = new Set<string>();
  private readonly renderedPmVectorSublayerIds = new Set<string>();

  constructor(context: SublayerRenderContext) {
    this.context = context;
  }

  reconcile(layers: LayerSummary[], state: SublayerRendererState): void {
    const nextRemoteSublayerIds = new Set<string>();
    const nextPmVectorSublayerIds = new Set<string>();
    const layersById = new Map(layers.map((layer) => [layer.id, layer]));

    for (const layerId of state.activeLayerIds) {
      const layer = layersById.get(layerId);
      if (!layer) continue;

      const sublayerState = state.sublayersByLayerId[layer.id] ?? {};
      for (const [index, sublayer] of layer.sublayers.entries()) {
        const target = { layerId: layer.id, sublayer };
        const enabled = sublayerState[sublayer.id] ?? (index === 0);
        if (!enabled) continue;

        if (canRenderRemoteSublayer(target) && renderRemoteSublayer(this.context, target)) {
          nextRemoteSublayerIds.add(sublayer.id);
        }
        if (canRenderPmVectorSublayer(target) && renderPmVectorSublayer(this.context, target)) {
          nextPmVectorSublayerIds.add(sublayer.id);
        }
      }
    }

    for (const sublayerId of this.renderedRemoteSublayerIds) {
      if (!nextRemoteSublayerIds.has(sublayerId)) {
        removeRemoteSublayer(this.context, sublayerId);
      }
    }
    for (const sublayerId of this.renderedPmVectorSublayerIds) {
      if (!nextPmVectorSublayerIds.has(sublayerId)) {
        removePmVectorSublayer(this.context, sublayerId);
      }
    }

    this.renderedRemoteSublayerIds.clear();
    for (const sublayerId of nextRemoteSublayerIds) {
      this.renderedRemoteSublayerIds.add(sublayerId);
    }
    this.renderedPmVectorSublayerIds.clear();
    for (const sublayerId of nextPmVectorSublayerIds) {
      this.renderedPmVectorSublayerIds.add(sublayerId);
    }
  }

  destroy(): void {
    for (const sublayerId of this.renderedRemoteSublayerIds) {
      removeRemoteSublayer(this.context, sublayerId);
    }
    for (const sublayerId of this.renderedPmVectorSublayerIds) {
      removePmVectorSublayer(this.context, sublayerId);
    }
    this.renderedRemoteSublayerIds.clear();
    this.renderedPmVectorSublayerIds.clear();
  }
}
