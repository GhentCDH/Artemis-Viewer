<script lang="ts">
  import { onMount } from 'svelte';
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
  import { buildScreenshotFilename, captureViewScreenshot } from '$lib/features/screenshot/screenshot';
  import type { IiifMaskHit } from '$lib/core/renderers/iiif/iiifMaskInteraction';
  import type { PaneId } from '$lib/core/map/maplibreInit';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Tooltip from '$lib/shared/primitives/Tooltip.svelte';
  import { hideTooltip, showTooltip } from '$lib/shared/tooltip.svelte';
  import MapPane from './MapPane.svelte';

  let layers = $state<LayerSummary[]>([]);
  let siteMetadata = $state<SiteMetadata>({ title: 'About Artemis', info: [], attribution: '', team: [], logos: [] });
  let workspaceElement = $state<HTMLElement | null>(null);
  let leftMap = $state<maplibregl.Map | null>(null);
  let rightMap = $state<maplibregl.Map | null>(null);
  let openDocument = $state<{ manifestUrl: string; imageId: string; pane: PaneId } | null>(null);
  let openDocumentTitle = $state('');
  let viewerCanvasHost = $state<HTMLElement | null>(null);
  let isViewerExpanded = $state(false);
  let isCapturingScreenshot = $state(false);
  let isImageBrowserOpen = $state(false);
  let isMobile = $state(false);
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
    openDocumentTitle = '';
    isViewerExpanded = isMobile;
  }

  function closeIiifDocument(): void {
    isViewerExpanded = false;
    openDocument = null;
    openDocumentTitle = '';
  }

  async function captureScreenshot(): Promise<void> {
    if (!workspaceElement || isCapturingScreenshot) return;
    const maps = [leftMap, rightMap].filter((map): map is maplibregl.Map => map !== null);
    if (maps.length === 0 && !viewerCanvasHost) return;
    isCapturingScreenshot = true;
    try {
      const filename = buildScreenshotFilename({
        center: maps[0]?.getCenter(),
        layerLabels: timelineSelection.activeLayerIds.map(
          (layerId) => layers.find((layer) => layer.id === layerId)?.label ?? layerId
        ),
        documentTitle: openDocument ? openDocumentTitle : '',
      });
      await captureViewScreenshot({ stage: workspaceElement, maps, viewerHost: viewerCanvasHost }, filename);
    } catch (error) {
      console.error('Screenshot export failed', error);
    } finally {
      isCapturingScreenshot = false;
    }
  }

  function showControlTooltip(text: string, event: MouseEvent | FocusEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showTooltip({ text, x: rect.left + rect.width / 2, y: rect.top, placement: 'above' });
  }

  // Hard camera lock only makes sense with both panes on screen; dropping either
  // reference (pane closed, or compare mode exited below) tears the sync down.
  $effect(() => {
    if (!leftMap || !rightMap) return;
    return syncPaneCameras(leftMap, rightMap);
  });

  onMount(() => {
    const mobileQuery = window.matchMedia('(max-width: 40rem)');
    const syncMobileMode = () => {
      isMobile = mobileQuery.matches;
      if (isMobile) timelineSelection.setMode('single');
      if (openDocument) isViewerExpanded = isMobile;
    };
    syncMobileMode();
    mobileQuery.addEventListener('change', syncMobileMode);
    return () => mobileQuery.removeEventListener('change', syncMobileMode);
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

{#snippet documentViewer(doc: NonNullable<typeof openDocument>)}
  {#key `${doc.manifestUrl}|${doc.imageId}`}
    <IiifViewer
      manifestUrl={doc.manifestUrl}
      imageId={doc.imageId}
      forceExpanded={isMobile}
      onclose={closeIiifDocument}
      onExpandedChange={(expanded) => (isViewerExpanded = expanded)}
      onCanvasHost={(host) => (viewerCanvasHost = host)}
      onTitleChange={(title) => (openDocumentTitle = title)}
    />
  {/key}
{/snippet}

<main class="canvas">
  <div
    class="workspace-layer"
    class:workspace-layer--viewer-expanded={isViewerExpanded}
    class:workspace-layer--compare={isCompare}
    bind:this={workspaceElement}
  >
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
      {@render documentViewer(openDocument)}
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
        {@render documentViewer(openDocument)}
      {/if}
    {:else if openDocument?.pane === 'right'}
      {@render documentViewer(openDocument)}
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
          class="compare-toggle"
          aria-label="Toggle compare mode"
          disabled={isMobile}
          onclick={() => {
            if (!isMobile) timelineSelection.toggleCompareMode();
          }}
        >
          <svg class="compare-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span class="compare-toggle-text">{isCompare ? 'Exit Compare' : 'Compare'}</span>
        </Button>
        <SearchMenu {leftMap} {rightMap} />
      </div>
    </div>

    <div class="window-slot screenshot-slot">
      <div class="screenshot-control">
        <Button
          iconOnly
          disabled={isCapturingScreenshot}
          aria-label="Screenshot without UI"
          onmouseenter={(event) => showControlTooltip('Screenshot without UI', event)}
          onmouseleave={hideTooltip}
          onfocus={(event) => showControlTooltip('Screenshot without UI', event)}
          onblur={hideTooltip}
          onclick={captureScreenshot}
          style="--button-height: var(--canvas-primary-control-height);"
        >
          <svg class="screenshot-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"></path>
            <path d="M12 8v6M9 11.5l3 3 3-3"></path>
          </svg>
        </Button>
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

  /* Same row as the compare/search controls (just above the timeline), right edge. */
  .screenshot-slot {
    right: var(--space-4);
    bottom: calc(var(--canvas-timeline-bottom) + var(--canvas-timeline-height) + var(--space-4));
    display: flex;
  }

  .screenshot-control {
    display: flex;
  }

  .compare-control {
    display: flex;
    gap: var(--space-2);
  }

  /* Descendant selector (not inline style) so the portrait media query below can
     override these; the extra specificity beats the Button defaults outright. */
  .compare-control :global(.compare-toggle) {
    --button-height: var(--canvas-primary-control-height);
    --button-padding-inline: var(--canvas-primary-control-padding-inline);
    --button-gap: var(--canvas-primary-control-gap);
    --button-font-size: var(--canvas-primary-control-font-size);
  }

  .compare-icon {
    display: none;
    width: calc(1rem * 1.5);
    height: calc(1rem * 1.5);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .screenshot-icon {
    /* Matches the 1.5x scale of the primary-control sizing vars above. */
    width: calc(1rem * 1.5);
    height: calc(1rem * 1.5);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Portrait windows stack the compare panes vertically (left pane on top), pin
     each sublayer menu to the top edge of its own half, and collapse the compare
     toggle to a square icon-only button (the search trigger does the same in
     SearchMenu.svelte). Last in the stylesheet so it outranks the base rules. */
  @media (orientation: portrait) {
    .workspace-layer--compare {
      flex-direction: column;
    }

    .sublayer-menu-slot--left.sublayer-menu-slot--split {
      right: var(--space-4);
    }

    .sublayer-menu-slot--right {
      top: calc(50% + var(--space-4));
      left: var(--space-4);
    }

    .compare-control :global(.compare-toggle) {
      --button-width: var(--canvas-primary-control-height);
      --button-padding-inline: 0rem;
    }

    .compare-icon {
      display: block;
    }

    .compare-toggle-text {
      display: none;
    }
  }

  @media (max-width: 40rem) {
    .compare-control :global(.compare-toggle) {
      display: none;
    }
  }
</style>
