<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type maplibregl from 'maplibre-gl';
  import { datasetBaseUrl, datasetUrl } from '$lib/core/dataset/dataSource';
  import { loadLayerRegistry, type LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { syncPaneCameras } from '$lib/core/map/paneSync';
  import {
    ARTEMIS_BASEMAP,
    type BasemapOption,
    type OverlayFeatureInfo,
    type OverlayOption,
  } from '$lib/core/map/basemap';
  import BasemapMenu from '$lib/features/basemap/BasemapMenu.svelte';
  import { discoverOverlayQueryCapability } from '$lib/features/basemap/customBasemap';
  import { i18n, t, LOCALE_SHORT_LABELS, type Locale } from '$lib/shared/i18n/i18nStore.svelte';
  import { loadMapServiceRegistry } from '$lib/features/basemap/mapServiceRegistry';
  import OverlayFeatureBubble from '$lib/features/basemap/OverlayFeatureBubble.svelte';
  import Timeline from '$lib/features/timeline/Timeline.svelte';
  import PaneSublayerMenu from '$lib/features/timeline/PaneSublayerMenu.svelte';
  import {
    DEFAULT_TIMELINE_LAYER_ID,
    timelineSelection,
  } from '$lib/features/timeline/timelineSelectionStore.svelte';
  import SearchMenu from '$lib/features/search/SearchMenu.svelte';
  import LocationPing from '$lib/shared/primitives/LocationPing.svelte';
  import type { SearchFocusTarget } from '$lib/features/search/searchSelection';
  import BrandingPanel from '$lib/features/branding/BrandingPanel.svelte';
  import { developerSettings } from '$lib/features/developerSettings/developerSettingsStore.svelte';
  import ImageBrowser from '$lib/features/images/ImageBrowser.svelte';
  import ScaleIndicator from '$lib/features/map/ScaleIndicator.svelte';
  import ZoomIndicator from '$lib/features/map/ZoomIndicator.svelte';
  import IiifViewer from '$lib/features/viewer/IiifViewer.svelte';
  import { buildScreenshotFilename, captureViewScreenshot } from '$lib/features/screenshot/screenshot';
  import { createUrlPersistence, type UrlPersistence } from '$lib/features/url/urlPersistence';
  import {
    decodeAppState,
    DEFAULT_URL_CENTER,
    type UrlAppState,
  } from '$lib/features/url/urlState';
  import type { PaneId } from '$lib/core/map/maplibreInit';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Tooltip from '$lib/shared/primitives/Tooltip.svelte';
  import { hideTooltip, showTooltip } from '$lib/shared/primitives/tooltipStore.svelte';
  import MapPane from './MapPane.svelte';

  const selectedDatasetBaseUrl = datasetBaseUrl(developerSettings.dataSource);
  const initialUrlState: UrlAppState =
    typeof window === 'undefined' ? {} : decodeAppState(window.location.hash, selectedDatasetBaseUrl);
  const hasPersistentUrlState = typeof window !== 'undefined' && window.location.hash.length > 1;
  const initialCenter = initialUrlState.center ?? DEFAULT_URL_CENTER;
  const initialMapCamera = { center: initialCenter, zoom: initialCenter.zoom, bearing: 0, pitch: 0 };

  timelineSelection.restorePersistentState({
    mode: initialUrlState.viewMode === 'split' ? 'compare' : 'single',
    leftLayerId: hasPersistentUrlState
      ? (initialUrlState.leftMainId ?? null)
      : DEFAULT_TIMELINE_LAYER_ID,
    rightLayerId: initialUrlState.rightMainId ?? null,
  });

  let layers = $state<LayerSummary[]>([]);
  let workspaceElement = $state<HTMLElement | null>(null);
  let brandingWatermarkElement = $state<HTMLElement | null>(null);
  let brandingCoverWidthRem = $state(0);
  let leftMap = $state<maplibregl.Map | null>(null);
  let rightMap = $state<maplibregl.Map | null>(null);
  let searchPing = $state<(SearchFocusTarget & { id: number }) | null>(null);
  let nextSearchPingId = 0;
  let openDocument = $state<{ manifestUrl: string; imageId: string; pane: PaneId } | null>(
    initialUrlState.viewerManifestUrl
      ? {
          manifestUrl: initialUrlState.viewerManifestUrl,
          imageId: initialUrlState.viewerImageId ?? '',
          pane: initialUrlState.viewerPane ?? 'right',
        }
      : null
  );
  let openDocumentTitle = $state('');
  let viewerCanvasHost = $state<HTMLElement | null>(null);
  let isViewerExpanded = $state(false);
  let isCapturingScreenshot = $state(false);
  let isMobile = $state(false);
  let selectedBasemap = $state<BasemapOption>(ARTEMIS_BASEMAP);
  let selectedOverlay = $state<OverlayOption | null>(null);
  let registeredBasemaps = $state<BasemapOption[]>([]);
  let registeredOverlays = $state<OverlayOption[]>([]);
  let overlayOpacity = $state(0.6);
  let overlayFeature = $state<{
    map: maplibregl.Map;
    lngLat: [number, number];
    info: OverlayFeatureInfo;
  } | null>(null);
  const pmtilesUrl = datasetUrl('baselayer.pmtiles', selectedDatasetBaseUrl);
  const isCompare = $derived(timelineSelection.mode === 'compare');
  const leftMenuLayer = $derived(layers.find((layer) => layer.id === timelineSelection.paneLayerIds.left) ?? null);
  const rightMenuLayer = $derived(layers.find((layer) => layer.id === timelineSelection.paneLayerIds.right) ?? null);
  let urlPersistence = $state<UrlPersistence | undefined>();

  function cameraFromMap(map: maplibregl.Map | null) {
    if (!map) return undefined;
    const center = map.getCenter();
    return {
      center,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
  }

  function currentUrlState(): UrlAppState {
    const map = leftMap ?? rightMap;
    const center = map?.getCenter();
    return {
      center: map && center ? { lng: center.lng, lat: center.lat, zoom: map.getZoom() } : initialCenter,
      leftMainId: timelineSelection.paneLayerIds.left ?? undefined,
      rightMainId: timelineSelection.paneLayerIds.right ?? undefined,
      viewMode: timelineSelection.mode === 'compare' ? 'split' : undefined,
      viewerManifestUrl: openDocument?.manifestUrl,
      viewerImageId: openDocument?.imageId,
      viewerPane: openDocument?.pane,
    };
  }

  function openIiifDocument(sourcePane: PaneId, hit: { manifestUrl: string; imageId: string }): void {
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
      await captureViewScreenshot(
        {
          stage: workspaceElement,
          maps,
          viewerHost: viewerCanvasHost,
          watermark: brandingWatermarkElement?.querySelector<HTMLElement>('.branding-trigger-scale'),
        },
        filename
      );
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

  // The button label reflects the platform's active language; activating it
  // still switches to the other supported locale.
  const targetLocale: Locale = $derived(i18n.locale === 'nl' ? 'en' : 'nl');

  function handleOverlayFeature(result: {
    map: maplibregl.Map;
    lngLat: [number, number];
    info: OverlayFeatureInfo | null;
  }): void {
    overlayFeature = result.info ? { ...result, info: result.info } : null;
    if (selectedOverlay?.query?.status === 'supported' && selectedOverlay.query.error) {
      const { error: _error, ...query } = selectedOverlay.query;
      selectedOverlay = { ...selectedOverlay, query };
    }
  }

  function handleOverlayQueryError(reason: string): void {
    overlayFeature = null;
    if (selectedOverlay?.query?.status === 'supported') {
      selectedOverlay = { ...selectedOverlay, query: { ...selectedOverlay.query, error: reason } };
    }
  }

  /**
   * Registry overlays arrive without a probed query capability (probing every WMS overlay
   * at startup cost a GetCapabilities fetch each — see mapServiceRegistry). The probe runs on
   * first selection and the result is written back into the registered list, so it happens at
   * most once per overlay per session. Overlays without a serviceType (legacy persisted custom
   * overlays, or ones probed eagerly on creation) are left as they are.
   */
  function handleOverlaySelect(overlay: OverlayOption | null): void {
    selectedOverlay = overlay;
    overlayFeature = null;
    if (!overlay || overlay.query || !overlay.serviceType) return;
    void discoverOverlayQueryCapability({
      kind: overlay.kind,
      url: overlay.url,
      serviceType: overlay.serviceType,
    }).then((query) => {
      const probed: OverlayOption = { ...overlay, query };
      registeredOverlays = registeredOverlays.map((candidate) =>
        candidate.id === overlay.id ? probed : candidate
      );
      if (selectedOverlay?.id === overlay.id) selectedOverlay = probed;
    });
  }

  // Hard camera lock only makes sense with both panes on screen; dropping either
  // reference (pane closed, or compare mode exited below) tears the sync down.
  $effect(() => {
    if (!leftMap || !rightMap) return;
    return syncPaneCameras(leftMap, rightMap);
  });

  $effect(() => {
    const maps = [leftMap, rightMap].filter((map): map is maplibregl.Map => map !== null);
    if (!urlPersistence) return;
    const scheduleUpdate = () => urlPersistence?.schedule();
    for (const map of maps) map.on('move', scheduleUpdate);
    return () => {
      for (const map of maps) map.off('move', scheduleUpdate);
    };
  });

  $effect(() => {
    timelineSelection.mode;
    timelineSelection.paneLayerIds.left;
    timelineSelection.paneLayerIds.right;
    openDocument?.manifestUrl;
    openDocument?.imageId;
    openDocument?.pane;
    urlPersistence?.update();
  });

  $effect(() => {
    const trigger = brandingWatermarkElement?.querySelector<HTMLElement>('.branding-trigger-scale');
    if (!trigger) return;

    let active = true;
    const syncBrandingCoverWidth = () => {
      if (!active) return;
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      brandingCoverWidthRem = trigger.getBoundingClientRect().width / rootFontSize;
    };
    const resizeObserver = new ResizeObserver(syncBrandingCoverWidth);

    syncBrandingCoverWidth();
    resizeObserver.observe(trigger);
    window.addEventListener('resize', syncBrandingCoverWidth);
    void document.fonts.ready.then(syncBrandingCoverWidth);

    return () => {
      active = false;
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncBrandingCoverWidth);
    };
  });

  onMount(() => {
    urlPersistence = createUrlPersistence(selectedDatasetBaseUrl, currentUrlState);

    const mobileQuery = window.matchMedia('(max-width: 40rem)');
    const syncMobileMode = () => {
      isMobile = mobileQuery.matches;
      if (isMobile) timelineSelection.setMode('single');
      if (openDocument) isViewerExpanded = isMobile;
    };
    syncMobileMode();
    mobileQuery.addEventListener('change', syncMobileMode);
    return () => {
      mobileQuery.removeEventListener('change', syncMobileMode);
      urlPersistence?.dispose();
      urlPersistence = undefined;
    };
  });

  $effect(() => {
    if (!isCompare) {
      rightMap = null;
      if (openDocument?.pane === 'left') {
        openDocument = { ...openDocument, pane: 'right' };
      }
    }
  });

  // Browser-only: these fetches contribute nothing to the prerendered HTML and
  // the map-service capability probes need window (they fail on every SSR pass).
  if (browser) {
    void loadLayerRegistry(datasetUrl('layers.yaml', selectedDatasetBaseUrl)).then((nextLayers) => {
      layers = nextLayers;
    });

    void loadMapServiceRegistry(datasetUrl('map-services.yaml', selectedDatasetBaseUrl))
      .then((registry) => {
        registeredBasemaps = registry.basemaps;
        registeredOverlays = registry.overlays;
      })
      .catch((error) => console.error('Failed to load map service registry', error));
  }
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

<main class="artemis-app">
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
      basemap={selectedBasemap}
      overlay={selectedOverlay}
      {overlayOpacity}
      overlayFeatureOpen={overlayFeature !== null}
      datasetBaseUrl={selectedDatasetBaseUrl}
      allmapsOptions={developerSettings.allmapsOptions}
      allmapsRenderRevision={developerSettings.renderRevision}
      {layers}
      activeLayerId={timelineSelection.paneLayerIds.left}
      sublayersByLayerId={timelineSelection.sublayersByLayerId}
      initialCamera={cameraFromMap(rightMap) ?? initialMapCamera}
      onMapReady={(map) => (leftMap = map)}
      onIiifMaskSelect={(hit) => openIiifDocument('left', hit)}
      activeIiifMask={openDocument}
      onOverlayFeature={handleOverlayFeature}
      onOverlayQueryError={handleOverlayQueryError}
    />
    {:else}
      {@render documentViewer(openDocument)}
    {/if}
    {#if isCompare}
      {#if openDocument?.pane !== 'right'}
        <MapPane
        paneId="right"
        {pmtilesUrl}
        basemap={selectedBasemap}
        overlay={selectedOverlay}
        {overlayOpacity}
        overlayFeatureOpen={overlayFeature !== null}
        datasetBaseUrl={selectedDatasetBaseUrl}
        allmapsOptions={developerSettings.allmapsOptions}
        allmapsRenderRevision={developerSettings.renderRevision}
        {layers}
        activeLayerId={timelineSelection.paneLayerIds.right}
        sublayersByLayerId={timelineSelection.sublayersByLayerId}
        initialCamera={cameraFromMap(leftMap) ?? initialMapCamera}
        onMapReady={(map) => (rightMap = map)}
        onIiifMaskSelect={(hit) => openIiifDocument('right', hit)}
        activeIiifMask={openDocument}
        onOverlayFeature={handleOverlayFeature}
        onOverlayQueryError={handleOverlayQueryError}
      />
      {:else}
        {@render documentViewer(openDocument)}
      {/if}
    {:else if openDocument?.pane === 'right'}
      {@render documentViewer(openDocument)}
    {/if}
  </div>

  <div
    class="overlay-layer"
    style:--app-branding-cover-width={`${brandingCoverWidthRem}rem`}
  >
    {#if openDocument?.pane !== 'left'}
      <div class="window-slot branding-slot">
        <div class="branding-slot-inner" bind:this={brandingWatermarkElement}>
          <BrandingPanel style="--branding-scale: 1.6;" />
        </div>
      </div>
    {/if}

    <div class="window-slot compare-control-slot">
      <div class="compare-control">
        <Button
          variant="prominent"
          active={isCompare}
          class="compare-toggle"
          aria-label={t().controls.compareToggle}
          disabled={isMobile}
          onclick={() => {
            if (!isMobile) timelineSelection.toggleCompareMode();
          }}
        >
          <svg class="compare-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span class="compare-toggle-text">{isCompare ? t().controls.exitCompare : t().controls.compare}</span>
        </Button>
        <SearchMenu
          {leftMap}
          {rightMap}
          onfocus={(target) => {
            searchPing = { ...target, id: ++nextSearchPingId };
          }}
        />
      </div>
    </div>

    {#if searchPing}
      {#key searchPing.id}
        <LocationPing
          map={searchPing.map}
          lngLat={searchPing.lngLat}
          oncomplete={() => { searchPing = null; }}
        />
      {/key}
    {/if}

    <div class="window-slot bottom-right-controls-slot">
      <div class="bottom-right-controls">
        <ZoomIndicator map={leftMap ?? rightMap} />
        <ScaleIndicator map={leftMap ?? rightMap} />
        <div class="language-control">
          <Button
            aria-label={t().controls.changeLanguage}
            onmouseenter={(event) => showControlTooltip(t().controls.changeLanguage, event)}
            onmouseleave={hideTooltip}
            onfocus={(event) => showControlTooltip(t().controls.changeLanguage, event)}
            onblur={hideTooltip}
            onclick={() => i18n.setLocale(targetLocale)}
            style="--button-height: var(--app-primary-control-height); --button-font-size: var(--text-md);"
          >{LOCALE_SHORT_LABELS[i18n.locale]}</Button>
        </div>
        <BasemapMenu
          selected={selectedBasemap}
          {registeredBasemaps}
          onselect={(basemap) => { selectedBasemap = basemap; }}
          selectedOverlay={selectedOverlay}
          {registeredOverlays}
          onOverlaySelect={handleOverlaySelect}
          {overlayOpacity}
          onOverlayOpacityChange={(opacity) => { overlayOpacity = opacity; }}
        />
        <div class="screenshot-control">
          <Button
            iconOnly
            disabled={isCapturingScreenshot}
            aria-label={t().controls.screenshot}
            onmouseenter={(event) => showControlTooltip(t().controls.screenshot, event)}
            onmouseleave={hideTooltip}
            onfocus={(event) => showControlTooltip(t().controls.screenshot, event)}
            onblur={hideTooltip}
            onclick={captureScreenshot}
            style="--button-height: var(--app-primary-control-height);"
          >
            <svg class="screenshot-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"></path>
              <path d="M12 8v6M9 11.5l3 3 3-3"></path>
            </svg>
          </Button>
        </div>
      </div>
    </div>

    <div class="window-slot image-browser-slot">
      <ImageBrowser
        map={leftMap}
        showControls={!openDocument}
        onOpenImage={(image) => openIiifDocument('left', { manifestUrl: image.manifestUrl, imageId: '' })}
      />
    </div>

    {#if !isCompare || openDocument?.pane !== 'left'}
      <div class="window-slot sublayer-menu-slot sublayer-menu-slot--left" class:sublayer-menu-slot--split={isCompare}>
        <PaneSublayerMenu layer={leftMenuLayer} map={leftMap} />
      </div>
    {/if}
    {#if isCompare && openDocument?.pane !== 'right'}
      <div class="window-slot sublayer-menu-slot sublayer-menu-slot--right">
        <PaneSublayerMenu layer={rightMenuLayer} map={rightMap} />
      </div>
    {/if}

    <div class="window-slot timeline-slot">
      <Timeline {layers} />
    </div>
  </div>

  <Tooltip />
  {#if overlayFeature}
    <OverlayFeatureBubble
      map={overlayFeature.map}
      lngLat={overlayFeature.lngLat}
      info={overlayFeature.info}
      onclose={() => { overlayFeature = null; }}
    />
  {/if}
</main>

<style>
  .artemis-app {
    /* -- exposed -- */
    --app-timeline-height: 9rem;
    --app-timeline-bottom: var(--space-4);
    --app-primary-control-height: calc(1.75rem * 1.5);
    --app-primary-control-padding-inline: calc(var(--space-3) * 1.5);
    --app-primary-control-gap: calc(var(--space-2) * 1.5);
    --app-primary-control-font-size: calc(var(--text-xs) * 1.5);
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
    bottom: var(--app-timeline-bottom);
    height: var(--app-timeline-height);
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
    bottom: calc(var(--app-timeline-bottom) + var(--app-timeline-height) + var(--space-4));
    display: flex;
  }

  .image-browser-slot {
    top: var(--space-4);
    right: var(--space-4);
  }

  /* Zoom and map scale sit immediately left of the screenshot control. */
  .bottom-right-controls-slot {
    right: var(--space-4);
    bottom: calc(var(--app-timeline-bottom) + var(--app-timeline-height) + var(--space-4));
    display: flex;
  }

  .bottom-right-controls {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .screenshot-control,
  .language-control {
    display: flex;
  }

  .compare-control {
    display: flex;
    gap: var(--space-2);
  }

  /* Descendant selector (not inline style) so the portrait media query below can
     override these; the extra specificity beats the Button defaults outright. */
  .compare-control :global(.compare-toggle) {
    --button-height: var(--app-primary-control-height);
    --button-padding-inline: var(--app-primary-control-padding-inline);
    --button-gap: var(--app-primary-control-gap);
    --button-font-size: var(--app-primary-control-font-size);
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
      --button-width: var(--app-primary-control-height);
      --button-padding-inline: 0rem;
    }

    .compare-icon {
      display: block;
    }

    .compare-toggle-text {
      display: none;
    }
  }

  @media (max-width: 56rem) {
    .artemis-app {
      --app-timeline-height: 8.55rem;
    }
  }

  @media (max-width: 40rem) {
    .compare-control :global(.compare-toggle) {
      display: none;
    }
  }
</style>
