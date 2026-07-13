<script lang="ts">
  import Window from '$lib/shared/primitives/Window.svelte';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { computeAxisRange } from './timelineScale';
  import { timelineSelection } from './timelineSelection.svelte';
  import TimeAxis from './TimeAxis.svelte';
  import Meanders from './Meanders.svelte';
  import TimelineRiverBackdrop from './TimelineRiverBackdrop.svelte';

  let {
    layers = [],
  }: {
    layers?: LayerSummary[];
  } = $props();

  const axisRange = $derived(computeAxisRange(layers));
  const activeLayerIds = $derived(timelineSelection.activeLayerIds);
</script>

<div class="timeline-shell">
  <Window class="timeline-window" style="--window-radius: 0;" variant="docked" placement="bottom">
    <div class="track">
      <TimelineRiverBackdrop />
      <TimeAxis range={axisRange} />
      <Meanders {layers} range={axisRange} {activeLayerIds} onLayerClick={(layerId) => timelineSelection.toggleLayer(layerId)} />
    </div>
  </Window>
</div>

<style>
  .timeline-shell {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  :global(.timeline-window) {
    flex: 1 1 auto;
  }

  .track {
    --track-width: 100%;
    --timeline-line-width: 6.5px;

    position: relative;
    width: var(--track-width);
    height: 100%;
  }
</style>
