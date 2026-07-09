<script lang="ts">
  import { onMount } from 'svelte';
  import { DATASET_BASE_URL, datasetUrl } from '$lib/core/dataset/dataSource';
  import { loadLayerRegistry, type LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { initializeMapLibre } from '$lib/core/map/maplibreInit';
  import { BASELAYER_BOUNDS } from '$lib/core/map/basemap';
  import { SublayerRendererManager } from '$lib/core/renderers/sublayerRendererManager';
  import Timeline from '$lib/features/timeline/Timeline.svelte';
  import SublayerMenu from '$lib/features/timeline/SublayerMenu.svelte';
  import { timelineSelection } from '$lib/features/timeline/timelineSelection.svelte';
  import Tooltip from '$lib/shared/primitives/Tooltip.svelte';

  let workspacePane: HTMLElement;
  let layers = $state<LayerSummary[]>([]);
  let sublayerRendererManager = $state<SublayerRendererManager | null>(null);
  let dismissedSublayerMenuLayerId = $state<string | null>(null);
  const staticAssetBase = import.meta.env.BASE_URL.replace(/\/$/, '');
  const menuLayerId = $derived(timelineSelection.leftLayerId ?? timelineSelection.rightLayerId);
  const selectedMenuLayer = $derived(layers.find((layer) => layer.id === menuLayerId) ?? null);
  const menuLayer = $derived(selectedMenuLayer?.id === dismissedSublayerMenuLayerId ? null : selectedMenuLayer);
  const menuSublayerState = $derived(menuLayer ? (timelineSelection.sublayersByLayerId[menuLayer.id] ?? {}) : {});

  $effect(() => {
    if (!selectedMenuLayer) {
      dismissedSublayerMenuLayerId = null;
      return;
    }

    if (menuLayer) {
      timelineSelection.ensureSublayerDefaults(menuLayer.id, menuLayer.sublayers);
    }
  });

  $effect(() => {
    sublayerRendererManager?.reconcile(layers, {
      activeLayerIds: timelineSelection.activeLayerIds,
      sublayersByLayerId: timelineSelection.sublayersByLayerId,
    });
  });

  onMount(() => {
    const mapLibre = initializeMapLibre('left', {
      container: workspacePane,
      pmtilesUrl: `${staticAssetBase}/baselayer.pmtiles`,
      initialBounds: BASELAYER_BOUNDS,
    });
    const rendererManager = new SublayerRendererManager({
      map: mapLibre.map,
      paneId: mapLibre.paneId,
      datasetBaseUrl: DATASET_BASE_URL,
    });
    const reconcileOnStyleLoad = () => {
      rendererManager.reconcile(layers, {
        activeLayerIds: timelineSelection.activeLayerIds,
        sublayersByLayerId: timelineSelection.sublayersByLayerId,
      });
    };

    sublayerRendererManager = rendererManager;
    mapLibre.map.on('load', reconcileOnStyleLoad);
    mapLibre.map.on('styledata', reconcileOnStyleLoad);
    mapLibre.map.on('idle', reconcileOnStyleLoad);

    void loadLayerRegistry(datasetUrl('layers.yaml')).then((nextLayers) => {
      layers = nextLayers;
    });

    return () => {
      mapLibre.map.off('load', reconcileOnStyleLoad);
      mapLibre.map.off('styledata', reconcileOnStyleLoad);
      mapLibre.map.off('idle', reconcileOnStyleLoad);
      rendererManager.destroy();
      sublayerRendererManager = null;
      mapLibre.destroy();
    };
  });
</script>

<main class="canvas">
  <div class="workspace-layer">
    <section class="workspace-pane" aria-label="Map workspace" bind:this={workspacePane}></section>
  </div>

  <div class="overlay-layer">
    <div class="window-slot sublayer-menu-slot">
      <SublayerMenu
        layer={menuLayer}
        sublayerState={menuSublayerState}
        onclose={() => {
          dismissedSublayerMenuLayerId = menuLayer?.id ?? null;
        }}
        ontoggle={(sublayerId) => {
          if (menuLayer) {
            timelineSelection.toggleSublayer(menuLayer.id, sublayerId);
          }
        }}
      />
    </div>

    <div class="window-slot timeline-slot">
      <Timeline {layers} />
    </div>
  </div>

  <Tooltip />
</main>

<style>
  .canvas {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .workspace-layer,
  .overlay-layer {
    position: absolute;
    inset: 0;
  }

  .workspace-layer {
    z-index: var(--z-map);
    overflow: hidden;
  }

  .overlay-layer {
    z-index: var(--z-overlay);
    pointer-events: none;
  }

  .workspace-pane {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--color-surface-raised);
  }

  .window-slot {
    position: absolute;
  }

  .window-slot > :global(*) {
    pointer-events: none;
  }

  .timeline-slot {
    left: 0;
    right: 0;
    bottom: 4%;
    height: 9rem;
    display: flex;
  }

  .sublayer-menu-slot {
    top: var(--space-4);
    left: var(--space-4);
    right: var(--space-4);
  }
</style>
