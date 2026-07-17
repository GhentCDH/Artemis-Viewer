import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
import { canRenderIiifSublayer, iiifSublayerLayerIds, removeIiifSublayer, renderIiifSublayer } from './iiif/iiifRenderer';
import { IiifMaskInteraction, type ActiveIiifMask, type IiifMaskHit } from './iiif/iiifMaskInteraction';
import { canRenderPmVectorSublayer, pmVectorSublayerLayerIds, renderPmVectorSublayer, removePmVectorSublayer } from './pmVectorRenderer';
import { canRenderRemoteSublayer, remoteSublayerLayerIds, renderRemoteSublayer, removeRemoteSublayer } from './remoteRenderer';
import type { AllmapsRenderOptions, SublayerRenderContext } from './types';
import { zoomToWmsVisibility } from './wmsVisibilityZoom';

export interface SublayerRendererState {
  activeLayerIds: string[];
  sublayersByLayerId: Record<string, Record<string, boolean>>;
}

export class SublayerRendererManager {
  private readonly context: SublayerRenderContext;
  private readonly renderedRemoteSublayerIds = new Set<string>();
  private readonly visibilityZoomCheckedSublayerIds = new Set<string>();
  private readonly renderedPmVectorSublayerIds = new Set<string>();
  // Sublayer ids with an issued (possibly still in-flight) IIIF render. Unlike the
  // remote/pmVector sets, membership here does not imply the render succeeded yet:
  // a failed attempt removes itself so the next reconcile pass (on style readiness) retries.
  private readonly activeIiifSublayerIds = new Set<string>();
  private allmapsRenderRevision: number;
  private appliedLayerOrderSignature = '';
  private readonly iiifMaskInteraction: IiifMaskInteraction;
  private activeIiifMask: ActiveIiifMask | null = null;

  constructor(
    context: SublayerRenderContext,
    allmapsRenderRevision = 0,
    onIiifMaskSelect?: (hit: IiifMaskHit) => void,
    iiifMaskShouldYield?: (point: { x: number; y: number }) => boolean
  ) {
    this.context = context;
    this.allmapsRenderRevision = allmapsRenderRevision;
    this.iiifMaskInteraction = new IiifMaskInteraction(context.map, context.paneId, onIiifMaskSelect, iiifMaskShouldYield);
  }

  updateAllmapsOptions(options: AllmapsRenderOptions, revision: number): void {
    this.context.allmapsOptions = options;
    if (this.allmapsRenderRevision === revision) return;
    this.allmapsRenderRevision = revision;
    this.appliedLayerOrderSignature = '';
    for (const sublayerId of this.activeIiifSublayerIds) {
      removeIiifSublayer(this.context, sublayerId);
    }
    this.activeIiifSublayerIds.clear();
  }

  setActiveIiifMask(active: ActiveIiifMask | null): void {
    this.activeIiifMask = active;
    this.iiifMaskInteraction.setActive(active);
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
          if (sublayer.kind === 'wms' && sublayer.source?.url && !this.visibilityZoomCheckedSublayerIds.has(sublayer.id)) {
            this.visibilityZoomCheckedSublayerIds.add(sublayer.id);
            void zoomToWmsVisibility(
              this.context.map,
              sublayer.source.url,
              () => this.visibilityZoomCheckedSublayerIds.has(sublayer.id)
            );
          }
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
        this.visibilityZoomCheckedSublayerIds.delete(sublayerId);
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
    this.iiifMaskInteraction.setActive(this.activeIiifMask);

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
    const existingLayerIds = enabledSublayerIds.flatMap((sublayerId) => [
      ...remoteSublayerLayerIds(this.context.paneId, sublayerId),
      ...pmVectorSublayerLayerIds(this.context.paneId, sublayerId),
      ...iiifSublayerLayerIds(this.context.paneId, sublayerId),
    ]).filter((id) => Boolean(this.context.map.getLayer(id)));
    const signature = existingLayerIds.join('\u0000');
    if (signature === this.appliedLayerOrderSignature) return;
    this.appliedLayerOrderSignature = signature;

    for (const id of existingLayerIds) {
      try {
        this.context.map.moveLayer(id);
      } catch {
        // The style may be mid-transition. Clear the signature so the next reconcile retries.
        this.appliedLayerOrderSignature = '';
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
    this.visibilityZoomCheckedSublayerIds.clear();
    this.renderedPmVectorSublayerIds.clear();
    this.activeIiifSublayerIds.clear();
    this.appliedLayerOrderSignature = '';
    this.iiifMaskInteraction.destroy();
  }
}
