<script lang="ts">
  import { onMount } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import { initializeMapLibre, type MapLibreInitCamera, type PaneId } from '$lib/core/map/maplibreInit';
  import { BASELAYER_BOUNDS } from '$lib/core/map/basemap';
  import { SublayerRendererManager } from '$lib/core/renderers/sublayerRendererManager';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';

  let {
    paneId,
    pmtilesUrl,
    datasetBaseUrl,
    layers,
    activeLayerId,
    sublayersByLayerId,
    initialCamera,
    onMapReady,
  }: {
    paneId: PaneId;
    pmtilesUrl: string;
    datasetBaseUrl: string;
    layers: LayerSummary[];
    activeLayerId: string | null;
    sublayersByLayerId: Record<string, Record<string, boolean>>;
    /** Frames the pane on this camera instead of BASELAYER_BOUNDS — used to spawn a compare pane matching the other pane's current view. */
    initialCamera?: MapLibreInitCamera;
    onMapReady?: (map: maplibregl.Map) => void;
  } = $props();

  let container: HTMLElement;
  let rendererManager = $state<SublayerRendererManager | null>(null);

  function reconcile(): void {
    rendererManager?.reconcile(layers, {
      activeLayerIds: activeLayerId ? [activeLayerId] : [],
      sublayersByLayerId,
    });
  }

  $effect(() => {
    reconcile();
  });

  onMount(() => {
    const mapLibre = initializeMapLibre(paneId, {
      container,
      pmtilesUrl,
      initialBounds: BASELAYER_BOUNDS,
      initialCamera,
    });
    const manager = new SublayerRendererManager({
      map: mapLibre.map,
      paneId,
      datasetBaseUrl,
    });
    const reconcileOnStyleLoad = () => {
      manager.reconcile(layers, {
        activeLayerIds: activeLayerId ? [activeLayerId] : [],
        sublayersByLayerId,
      });
    };

    rendererManager = manager;
    mapLibre.map.on('load', reconcileOnStyleLoad);
    mapLibre.map.on('styledata', reconcileOnStyleLoad);
    mapLibre.map.on('idle', reconcileOnStyleLoad);

    // Replaces the old tick/timeout resize dance: the observer fires exactly when the
    // pane's box actually changes size, whatever caused it (layout grid, sidebar, split).
    const resizeObserver = new ResizeObserver(() => mapLibre.map.resize());
    resizeObserver.observe(container);

    onMapReady?.(mapLibre.map);

    return () => {
      resizeObserver.disconnect();
      mapLibre.map.off('load', reconcileOnStyleLoad);
      mapLibre.map.off('styledata', reconcileOnStyleLoad);
      mapLibre.map.off('idle', reconcileOnStyleLoad);
      manager.destroy();
      rendererManager = null;
      mapLibre.destroy();
    };
  });
</script>

<section class="workspace-pane" aria-label="Map workspace ({paneId})" bind:this={container}></section>

<style>
  .workspace-pane {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--color-surface-raised);
  }

  /* Global: the sibling here is another MapPane instance, invisible to this
     component's own template for Svelte's unused-selector analysis. */
  :global(.workspace-pane + .workspace-pane) {
    border-left: 1px solid var(--color-border);
  }
</style>
