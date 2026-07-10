<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { DATASET_BASE_URL, datasetUrl } from '$lib/core/dataset/dataSource';
  import { loadLayerRegistry, type LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { loadSiteMetadata, type SiteMetadata } from '$lib/core/dataset/siteMetadata';
  import { syncPaneCameras } from '$lib/core/map/paneSync';
  import Timeline from '$lib/features/timeline/Timeline.svelte';
  import PaneSublayerMenu from '$lib/features/timeline/PaneSublayerMenu.svelte';
  import { timelineSelection } from '$lib/features/timeline/timelineSelection.svelte';
  import SearchMenu from '$lib/features/search/SearchMenu.svelte';
  import BrandingPanel from '$lib/features/branding/BrandingPanel.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Tooltip from '$lib/shared/primitives/Tooltip.svelte';
  import MapPane from './MapPane.svelte';

  let layers = $state<LayerSummary[]>([]);
  let siteMetadata = $state<SiteMetadata>({ title: 'About Artemis', info: [], attribution: '', team: [], logos: [] });
  let leftMap = $state<maplibregl.Map | null>(null);
  let rightMap = $state<maplibregl.Map | null>(null);
  const staticAssetBase = import.meta.env.BASE_URL.replace(/\/$/, '');
  const pmtilesUrl = `${staticAssetBase}/baselayer.pmtiles`;
  const isCompare = $derived(timelineSelection.mode === 'compare');
  const leftMenuLayer = $derived(layers.find((layer) => layer.id === timelineSelection.leftLayerId) ?? null);
  const rightMenuLayer = $derived(layers.find((layer) => layer.id === timelineSelection.rightLayerId) ?? null);

  // Hard camera lock only makes sense with both panes on screen; dropping either
  // reference (pane closed, or compare mode exited below) tears the sync down.
  $effect(() => {
    if (!leftMap || !rightMap) return;
    return syncPaneCameras(leftMap, rightMap);
  });

  $effect(() => {
    if (!isCompare) {
      rightMap = null;
    }
  });

  void loadLayerRegistry(datasetUrl('layers.yaml')).then((nextLayers) => {
    layers = nextLayers;
  });

  void loadSiteMetadata(datasetUrl).then((nextSiteMetadata) => {
    siteMetadata = nextSiteMetadata;
  });
</script>

<main class="canvas">
  <div class="workspace-layer">
    <MapPane
      paneId="left"
      {pmtilesUrl}
      datasetBaseUrl={DATASET_BASE_URL}
      {layers}
      activeLayerId={timelineSelection.leftLayerId}
      sublayersByLayerId={timelineSelection.sublayersByLayerId}
      onMapReady={(map) => (leftMap = map)}
    />
    {#if isCompare}
      <MapPane
        paneId="right"
        {pmtilesUrl}
        datasetBaseUrl={DATASET_BASE_URL}
        {layers}
        activeLayerId={timelineSelection.rightLayerId}
        sublayersByLayerId={timelineSelection.sublayersByLayerId}
        initialCamera={leftMap
          ? { center: leftMap.getCenter(), zoom: leftMap.getZoom(), bearing: leftMap.getBearing(), pitch: leftMap.getPitch() }
          : undefined}
        onMapReady={(map) => (rightMap = map)}
      />
    {/if}
  </div>

  <div class="overlay-layer">
    <div class="window-slot branding-slot">
      <div class="branding-slot-inner">
        <BrandingPanel {siteMetadata} style="--branding-scale: 1.6;" />
      </div>
    </div>

    <div class="window-slot compare-control-slot">
      <div class="compare-control">
        <Button
          active={isCompare}
          aria-label="Toggle compare mode"
          onclick={() => timelineSelection.toggleCompareMode()}
          style="--button-height: calc(1.75rem * 1.3); --button-padding-inline: calc(var(--space-3) * 1.3); --button-font-size: calc(var(--text-xs) * 1.3);"
        >
          {isCompare ? 'Exit Compare' : 'Compare'}
        </Button>
        <SearchMenu {leftMap} {rightMap} />
      </div>
    </div>

    <div class="window-slot sublayer-menu-slot sublayer-menu-slot--left" class:sublayer-menu-slot--split={isCompare}>
      <PaneSublayerMenu layer={leftMenuLayer} />
    </div>
    {#if isCompare}
      <div class="window-slot sublayer-menu-slot sublayer-menu-slot--right">
        <PaneSublayerMenu layer={rightMenuLayer} />
      </div>
    {/if}

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
    display: flex;
    overflow: hidden;
  }

  .overlay-layer {
    z-index: var(--z-overlay);
    pointer-events: none;
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

  .branding-slot {
    top: var(--space-4);
    left: var(--space-4);
  }

  .branding-slot-inner {
    display: flex;
  }

  .sublayer-menu-slot {
    top: var(--space-4);
  }

  .sublayer-menu-slot--left {
    left: var(--space-4);
    right: var(--space-4);
  }

  /* In compare mode each pane owns half the width, so its sublayer menu doesn't
     drift into the other pane. */
  .sublayer-menu-slot--left.sublayer-menu-slot--split {
    right: 50%;
  }

  .sublayer-menu-slot--right {
    left: calc(50% + var(--space-4));
    right: var(--space-4);
  }

  .compare-control-slot {
    left: var(--space-4);
    bottom: calc(4% + 9rem + var(--space-2));
    display: flex;
  }

  .compare-control {
    display: flex;
    gap: var(--space-2);
  }
</style>
