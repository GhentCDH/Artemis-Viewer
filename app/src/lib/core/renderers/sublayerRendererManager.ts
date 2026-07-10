import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
import { canRenderIiifSublayer, iiifSublayerLayerIds, removeIiifSublayer, renderIiifSublayer } from './iiif/iiifRenderer';
import { IiifMaskInteraction, type IiifMaskHit } from './iiif/iiifMaskInteraction';
import { canRenderPmVectorSublayer, pmVectorSublayerLayerIds, renderPmVectorSublayer, removePmVectorSublayer } from './pmVectorRenderer';
import { canRenderRemoteSublayer, remoteSublayerLayerIds, renderRemoteSublayer, removeRemoteSublayer } from './remoteRenderer';
import type { AllmapsRenderOptions, SublayerRenderContext } from './types';

export interface SublayerRendererState {
  activeLayerIds: string[];
  sublayersByLayerId: Record<string, Record<string, boolean>>;
}

export class SublayerRendererManager {
  private readonly context: SublayerRenderContext;
  private readonly renderedRemoteSublayerIds = new Set<string>();
  private readonly renderedPmVectorSublayerIds = new Set<string>();
  // Sublayer ids with an issued (possibly still in-flight) IIIF render. Unlike the
  // remote/pmVector sets, membership here does not imply the render succeeded yet:
  // a failed attempt removes itself so the next reconcile pass (on style readiness) retries.
  private readonly activeIiifSublayerIds = new Set<string>();
  private allmapsRenderRevision: number;
  private readonly iiifMaskInteraction: IiifMaskInteraction;

  constructor(context: SublayerRenderContext, allmapsRenderRevision = 0, onIiifMaskSelect?: (hit: IiifMaskHit) => void) {
    this.context = context;
    this.allmapsRenderRevision = allmapsRenderRevision;
    this.iiifMaskInteraction = new IiifMaskInteraction(context.map, context.paneId, onIiifMaskSelect);
  }

  updateAllmapsOptions(options: AllmapsRenderOptions, revision: number): void {
    this.context.allmapsOptions = options;
    if (this.allmapsRenderRevision === revision) return;
    this.allmapsRenderRevision = revision;
    for (const sublayerId of this.activeIiifSublayerIds) {
      removeIiifSublayer(this.context, sublayerId);
    }
    this.activeIiifSublayerIds.clear();
  }

  reconcile(layers: LayerSummary[], state: SublayerRendererState): void {
    const nextRemoteSublayerIds = new Set<string>();
    const nextPmVectorSublayerIds = new Set<string>();
    const desiredIiifSublayerIds = new Set<string>();
    // Bottom-to-top stacking order of currently-enabled sublayers — reapplied after every
    // reconcile (see `applyLayerOrder`) so stacking never depends on which sublayer's async
    // render chain (e.g. an IIIF `loadGeomaps` fetch) happens to resolve first.
    const enabledSublayerIds: string[] = [];
    const layersById = new Map(layers.map((layer) => [layer.id, layer]));

    for (const layerId of state.activeLayerIds) {
      const layer = layersById.get(layerId);
      if (!layer) continue;

      const sublayerState = state.sublayersByLayerId[layer.id] ?? {};
      for (const [index, sublayer] of layer.sublayers.entries()) {
        const target = { layerId: layer.id, sublayer };
        const enabled = sublayerState[sublayer.id] ?? (index === 0);
        if (!enabled) continue;
        enabledSublayerIds.push(sublayer.id);

        if (canRenderRemoteSublayer(target) && renderRemoteSublayer(this.context, target)) {
          nextRemoteSublayerIds.add(sublayer.id);
        }
        if (canRenderPmVectorSublayer(target) && renderPmVectorSublayer(this.context, target)) {
          nextPmVectorSublayerIds.add(sublayer.id);
        }
        if (canRenderIiifSublayer(target)) {
          desiredIiifSublayerIds.add(sublayer.id);
          if (!this.activeIiifSublayerIds.has(sublayer.id)) {
            this.activeIiifSublayerIds.add(sublayer.id);
            void renderIiifSublayer(this.context, target).then((rendered) => {
              if (!rendered) {
                this.activeIiifSublayerIds.delete(sublayer.id);
              }
            });
          }
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
    for (const sublayerId of this.activeIiifSublayerIds) {
      if (!desiredIiifSublayerIds.has(sublayerId)) {
        removeIiifSublayer(this.context, sublayerId);
        this.activeIiifSublayerIds.delete(sublayerId);
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
    this.iiifMaskInteraction.updateSublayers([...desiredIiifSublayerIds]);

    this.applyLayerOrder(enabledSublayerIds);
    this.iiifMaskInteraction.moveOutlineToFront();
  }

  /**
   * Pins every enabled sublayer's maplibre layers to the stacking order implied by
   * `enabledSublayerIds` (bottom-to-top), via repeated `moveLayer(id)` (no `beforeId` — each
   * call moves that layer to the current top, so processing bottom-to-top leaves the last one on
   * top). Layers a sublayer hasn't created yet (still mid-async-render) are skipped and picked up
   * on the next reconcile once they exist — cheap enough to rerun every time since it's a handful
   * of ids, and it's what makes stacking deterministic regardless of renderer completion order.
   */
  private applyLayerOrder(enabledSublayerIds: string[]): void {
    for (const sublayerId of enabledSublayerIds) {
      const layerIds = [
        ...remoteSublayerLayerIds(this.context.paneId, sublayerId),
        ...pmVectorSublayerLayerIds(this.context.paneId, sublayerId),
        ...iiifSublayerLayerIds(this.context.paneId, sublayerId),
      ];
      for (const id of layerIds) {
        if (!this.context.map.getLayer(id)) continue;
        try {
          this.context.map.moveLayer(id);
        } catch {
          // ignore — style may be mid-transition
        }
      }
    }
  }

  destroy(): void {
    for (const sublayerId of this.renderedRemoteSublayerIds) {
      removeRemoteSublayer(this.context, sublayerId);
    }
    for (const sublayerId of this.renderedPmVectorSublayerIds) {
      removePmVectorSublayer(this.context, sublayerId);
    }
    for (const sublayerId of this.activeIiifSublayerIds) {
      removeIiifSublayer(this.context, sublayerId);
    }
    this.renderedRemoteSublayerIds.clear();
    this.renderedPmVectorSublayerIds.clear();
    this.activeIiifSublayerIds.clear();
    this.iiifMaskInteraction.destroy();
  }
}
