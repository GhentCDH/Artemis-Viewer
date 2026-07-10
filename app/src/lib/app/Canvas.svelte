<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { datasetBaseUrl, datasetUrl } from '$lib/core/dataset/dataSource';
  import { loadLayerRegistry, type LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { loadSiteMetadata, type SiteMetadata } from '$lib/core/dataset/siteMetadata';
  import { syncPaneCameras } from '$lib/core/map/paneSync';
  import Timeline from '$lib/features/timeline/Timeline.svelte';
  import PaneSublayerMenu from '$lib/features/timeline/PaneSublayerMenu.svelte';
  import { timelineSelection } from '$lib/features/timeline/timelineSelection.svelte';
  import SearchMenu from '$lib/features/search/SearchMenu.svelte';
  import BrandingPanel from '$lib/features/branding/BrandingPanel.svelte';
  import { developerSettings } from '$lib/features/developerSettings/developerSettings.svelte';
  import ImageBrowser from '$lib/features/images/ImageBrowser.svelte';
  import IiifViewer from '$lib/features/viewer/IiifViewer.svelte';
  import type { IiifMaskHit } from '$lib/core/renderers/iiif/iiifMaskInteraction';
  import type { PaneId } from '$lib/core/map/maplibreInit';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Tooltip from '$lib/shared/primitives/Tooltip.svelte';
  import MapPane from './MapPane.svelte';

  let layers = $state<LayerSummary[]>([]);
  let siteMetadata = $state<SiteMetadata>({ title: 'About Artemis', info: [], attribution: '', team: [], logos: [] });
  let leftMap = $state<maplibregl.Map | null>(null);
  let rightMap = $state<maplibregl.Map | null>(null);
  let openDocument = $state<{ manifestUrl: string; imageId: string; pane: PaneId } | null>(null);
  let isViewerExpanded = $state(false);
  let isImageBrowserOpen = $state(false);
  const staticAssetBase = import.meta.env.BASE_URL.replace(/\/$/, '');
  const pmtilesUrl = `${staticAssetBase}/baselayer.pmtiles`;
  const selectedDatasetBaseUrl = datasetBaseUrl(developerSettings.dataSource);
  const isCompare = $derived(timelineSelection.mode === 'compare');
  const leftMenuLayer = $derived(layers.find((layer) => layer.id === timelineSelection.leftLayerId) ?? null);
  const rightMenuLayer = $derived(layers.find((layer) => layer.id === timelineSelection.rightLayerId) ?? null);

  function openIiifDocument(sourcePane: PaneId, hit: IiifMaskHit): void {
    const viewerPane: PaneId = isCompare && sourcePane === 'right' ? 'left' : 'right';
    if (viewerPane === 'left') leftMap = null;
    else rightMap = null;
    openDocument = {
      manifestUrl: hit.manifestUrl,
      imageId: hit.imageId,
      pane: viewerPane,
    };
  }

  function closeIiifDocument(): void {
    isViewerExpanded = false;
    openDocument = null;
  }

  // Hard camera lock only makes sense with both panes on screen; dropping either
  // reference (pane closed, or compare mode exited below) tears the sync down.
  $effect(() => {
    if (!leftMap || !rightMap) return;
    return syncPaneCameras(leftMap, rightMap);
  });

  $effect(() => {
    if (!isCompare) {
      rightMap = null;
      if (openDocument?.pane === 'left') {
        openDocument = { ...openDocument, pane: 'right' };
      }
    }
  });

  void loadLayerRegistry(datasetUrl('layers.yaml', selectedDatasetBaseUrl)).then((nextLayers) => {
    layers = nextLayers;
  });

  void loadSiteMetadata((path) => datasetUrl(path, selectedDatasetBaseUrl)).then((nextSiteMetadata) => {
    siteMetadata = nextSiteMetadata;
  });
</script>

<main class="canvas">
  <div class="workspace-layer" class:workspace-layer--viewer-expanded={isViewerExpanded}>
    {#if openDocument?.pane !== 'left'}
    <MapPane
      paneId="left"
      {pmtilesUrl}
      datasetBaseUrl={selectedDatasetBaseUrl}
      allmapsOptions={developerSettings.allmapsOptions}
      allmapsRenderRevision={developerSettings.renderRevision}
      {layers}
      activeLayerId={timelineSelection.leftLayerId}
      sublayersByLayerId={timelineSelection.sublayersByLayerId}
      onMapReady={(map) => (leftMap = map)}
      onIiifMaskSelect={(hit) => openIiifDocument('left', hit)}
    />
    {:else}
      {#key `${openDocument.manifestUrl}|${openDocument.imageId}`}
        <IiifViewer manifestUrl={openDocument.manifestUrl} imageId={openDocument.imageId} onclose={closeIiifDocument} onExpandedChange={(expanded) => (isViewerExpanded = expanded)} />
      {/key}
    {/if}
    {#if isCompare}
      {#if openDocument?.pane !== 'right'}
        <MapPane
        paneId="right"
        {pmtilesUrl}
        datasetBaseUrl={selectedDatasetBaseUrl}
        allmapsOptions={developerSettings.allmapsOptions}
        allmapsRenderRevision={developerSettings.renderRevision}
        {layers}
        activeLayerId={timelineSelection.rightLayerId}
        sublayersByLayerId={timelineSelection.sublayersByLayerId}
        initialCamera={leftMap
          ? { center: leftMap.getCenter(), zoom: leftMap.getZoom(), bearing: leftMap.getBearing(), pitch: leftMap.getPitch() }
          : undefined}
        onMapReady={(map) => (rightMap = map)}
        onIiifMaskSelect={(hit) => openIiifDocument('right', hit)}
      />
      {:else}
        {#key `${openDocument.manifestUrl}|${openDocument.imageId}`}
          <IiifViewer manifestUrl={openDocument.manifestUrl} imageId={openDocument.imageId} onclose={closeIiifDocument} onExpandedChange={(expanded) => (isViewerExpanded = expanded)} />
        {/key}
      {/if}
    {:else if openDocument?.pane === 'right'}
      {#key `${openDocument.manifestUrl}|${openDocument.imageId}`}
        <IiifViewer manifestUrl={openDocument.manifestUrl} imageId={openDocument.imageId} onclose={closeIiifDocument} onExpandedChange={(expanded) => (isViewerExpanded = expanded)} />
      {/key}
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
          style="--button-height: var(--canvas-primary-control-height); --button-padding-inline: var(--canvas-primary-control-padding-inline); --button-gap: var(--canvas-primary-control-gap); --button-font-size: var(--canvas-primary-control-font-size);"
        >
          {isCompare ? 'Exit Compare' : 'Compare'}
        </Button>
        <SearchMenu {leftMap} {rightMap} />
      </div>
    </div>

    {#if !openDocument}
      <div class="window-slot image-browser-slot">
        <ImageBrowser map={leftMap} open={isImageBrowserOpen} onOpenChange={(open) => (isImageBrowserOpen = open)} />
      </div>
    {/if}

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
    /* -- exposed -- */
    --canvas-timeline-height: 9rem;
    --canvas-timeline-bottom: var(--space-4);
    --canvas-primary-control-height: calc(1.75rem * 1.5);
    --canvas-primary-control-padding-inline: calc(var(--space-3) * 1.5);
    --canvas-primary-control-gap: calc(var(--space-2) * 1.5);
    --canvas-primary-control-font-size: calc(var(--text-xs) * 1.5);
    /* -- end exposed -- */

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

  .workspace-layer--viewer-expanded {
    z-index: var(--z-window);
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
    bottom: var(--canvas-timeline-bottom);
    height: var(--canvas-timeline-height);
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
    bottom: calc(var(--canvas-timeline-bottom) + var(--canvas-timeline-height) + var(--space-4));
    display: flex;
  }

  .image-browser-slot {
    top: var(--space-4);
    right: var(--space-4);
  }

  .compare-control {
    display: flex;
    gap: var(--space-2);
  }
</style>
