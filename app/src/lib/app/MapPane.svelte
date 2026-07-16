<script lang="ts">
  import { onMount } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import { initializeMapLibre, type MapLibreInitCamera, type PaneId } from '$lib/core/map/maplibreInit';
  import {
    applyBasemap,
    applyOverlay,
    BASELAYER_BOUNDS,
    type BasemapOption,
    type OverlayOption,
  } from '$lib/core/map/basemap';
  import { SublayerRendererManager } from '$lib/core/renderers/sublayerRendererManager';
  import type { AllmapsRenderOptions } from '$lib/core/renderers/types';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import type { IiifMaskHit } from '$lib/core/renderers/iiif/iiifMaskInteraction';
  import { hasImagePinAt, restoreImagePins } from '$lib/features/images/imagePins';
  import { queryOverlayAtPoint } from '$lib/features/basemap/overlayQuery';
  import { format, t } from '$lib/shared/i18n/i18n.svelte';

  let {
    paneId,
    pmtilesUrl,
    basemap,
    overlay,
    overlayOpacity,
    overlayFeatureOpen,
    datasetBaseUrl,
    allmapsOptions,
    allmapsRenderRevision,
    layers,
    activeLayerId,
    sublayersByLayerId,
    initialCamera,
    onMapReady,
    onIiifMaskSelect,
    onOverlayFeature,
    onOverlayQueryError,
  }: {
    paneId: PaneId;
    pmtilesUrl: string;
    basemap: BasemapOption;
    overlay: OverlayOption | null;
    overlayOpacity: number;
    overlayFeatureOpen: boolean;
    datasetBaseUrl: string;
    allmapsOptions: AllmapsRenderOptions;
    allmapsRenderRevision: number;
    layers: LayerSummary[];
    activeLayerId: string | null;
    sublayersByLayerId: Record<string, Record<string, boolean>>;
    /** Frames the pane on this camera instead of BASELAYER_BOUNDS — used to spawn a compare pane matching the other pane's current view. */
    initialCamera?: MapLibreInitCamera;
    onMapReady?: (map: maplibregl.Map) => void;
    onIiifMaskSelect?: (hit: IiifMaskHit) => void;
    onOverlayFeature?: (result: {
      map: maplibregl.Map;
      lngLat: [number, number];
      info: import('$lib/core/map/basemap').OverlayFeatureInfo | null;
    }) => void;
    onOverlayQueryError?: (reason: string) => void;
  } = $props();

  let container: HTMLElement;
  let map = $state<maplibregl.Map | null>(null);
  let rendererManager = $state<SublayerRendererManager | null>(null);

  function reconcile(): void {
    rendererManager?.updateAllmapsOptions(allmapsOptions, allmapsRenderRevision);
    rendererManager?.reconcile(layers, {
      activeLayerIds: activeLayerId ? [activeLayerId] : [],
      sublayersByLayerId,
    });
    if (map) applyOverlay(map, overlay, overlayOpacity);
    if (map) restoreImagePins(map);
  }

  $effect(() => {
    reconcile();
  });

  $effect(() => {
    if (map) applyBasemap(map, basemap);
  });

  $effect(() => {
    if (map) applyOverlay(map, overlay, overlayOpacity);
  });

  $effect(() => {
    if (!map || !overlay || overlay.query?.status !== 'supported') return;
    let requestRevision = 0;
    const handleClick = async (event: maplibregl.MapMouseEvent) => {
      if (overlayFeatureOpen) {
        onOverlayFeature?.({ map: map!, lngLat: [event.lngLat.lng, event.lngLat.lat], info: null });
        return;
      }
      if (hasImagePinAt(map!, event.point)) return;
      const revision = ++requestRevision;
      try {
        const info = await queryOverlayAtPoint(map!, overlay, event);
        if (revision !== requestRevision) return;
        onOverlayFeature?.({ map: map!, lngLat: [event.lngLat.lng, event.lngLat.lat], info });
      } catch (reason) {
        if (revision !== requestRevision) return;
        const message = reason instanceof Error ? reason.message : t().basemap.featureInfoFailed;
        onOverlayQueryError?.(message);
      }
    };
    map.on('click', handleClick);
    return () => {
      requestRevision += 1;
      map?.off('click', handleClick);
    };
  });

  onMount(() => {
    const mapLibre = initializeMapLibre(paneId, {
      container,
      pmtilesUrl,
      initialBounds: BASELAYER_BOUNDS,
      initialCamera,
    });
    const manager = new SublayerRendererManager(
      {
        map: mapLibre.map,
        paneId,
        datasetBaseUrl,
        allmapsOptions,
      },
      allmapsRenderRevision,
      onIiifMaskSelect,
      (point) => hasImagePinAt(mapLibre.map, point)
    );
    const reconcileOnStyleLoad = () => {
      manager.reconcile(layers, {
        activeLayerIds: activeLayerId ? [activeLayerId] : [],
        sublayersByLayerId,
      });
      applyOverlay(mapLibre.map, overlay, overlayOpacity);
      restoreImagePins(mapLibre.map);
    };
    const applySelectedMapLayers = () => {
      applyBasemap(mapLibre.map, basemap);
      applyOverlay(mapLibre.map, overlay, overlayOpacity);
    };

    map = mapLibre.map;
    rendererManager = manager;
    mapLibre.map.on('load', applySelectedMapLayers);
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
      mapLibre.map.off('load', applySelectedMapLayers);
      mapLibre.map.off('load', reconcileOnStyleLoad);
      mapLibre.map.off('styledata', reconcileOnStyleLoad);
      mapLibre.map.off('idle', reconcileOnStyleLoad);
      manager.destroy();
      rendererManager = null;
      map = null;
      mapLibre.destroy();
    };
  });
</script>

<section class="workspace-pane" aria-label={format(t().controls.mapWorkspace, { pane: paneId === 'left' ? t().controls.paneLeft : t().controls.paneRight })} bind:this={container}></section>

<style>
  .workspace-pane {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--color-surface-raised);
  }

  /* Global: the sibling here is another MapPane instance, invisible to this
     component's own template for Svelte's unused-selector analysis. */
  :global(.workspace-pane + .workspace-pane) {
    border-left: 1px solid var(--color-border);
  }

  /* Portrait compare stacks the panes vertically, so the divider between them
     runs horizontally instead. */
  @media (orientation: portrait) {
    :global(.workspace-pane + .workspace-pane) {
      border-left: none;
      border-top: 1px solid var(--color-border);
    }
  }
</style>
