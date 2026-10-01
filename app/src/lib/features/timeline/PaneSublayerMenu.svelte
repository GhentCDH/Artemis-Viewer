<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { DEFAULT_TIMELINE_LAYER_ID, timelineSelection } from './timelineSelectionStore.svelte';
  import SublayerMenu from './SublayerMenu.svelte';

  let {
    layer,
    map = null,
  }: {
    layer: LayerSummary | null;
    map?: maplibregl.Map | null;
  } = $props();

  // Local to this pane: dismissing the right pane's menu must not affect the left pane's.
  // Keep the default reduced-cadastre layer selected on first load without rendering its
  // panel above the branding panel; after the initial render, menu behavior remains normal.
  let dismissedLayerId = $state<string | null>(null);
  let isInitialLoad = $state(true);
  const menuLayer = $derived(layer?.id === dismissedLayerId ? null : layer);
  const sublayerState = $derived(menuLayer ? (timelineSelection.sublayersByLayerId[menuLayer.id] ?? {}) : {});

  $effect(() => {
    if (!layer) {
      dismissedLayerId = null;
      return;
    }

    if (isInitialLoad) {
      isInitialLoad = false;
      if (layer.id === DEFAULT_TIMELINE_LAYER_ID) {
        dismissedLayerId = layer.id;
      }
      return;
    }

    if (menuLayer) {
      timelineSelection.ensureSublayerDefaults(menuLayer.id, menuLayer.sublayers);
    }
  });
</script>

<SublayerMenu
  layer={menuLayer}
  {map}
  {sublayerState}
  onclose={() => {
    dismissedLayerId = menuLayer?.id ?? null;
  }}
  ontoggle={(sublayerId) => {
    if (menuLayer) {
      timelineSelection.toggleSublayer(menuLayer.id, sublayerId);
    }
  }}
/>
