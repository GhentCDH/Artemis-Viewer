<script lang="ts">
  import { t } from '$lib/shared/i18n/i18nStore.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { computeAxisRange } from './timelineScale';
  import { timelineSelection } from './timelineSelectionStore.svelte';
  import TimeAxis from './TimeAxis.svelte';
  import Meanders from './Meanders.svelte';

  let {
    layers = [],
    oncollapsed,
  }: {
    layers?: LayerSummary[];
    oncollapsed?: (collapsed: boolean) => void;
  } = $props();

  let isCollapsed = $state(false);
  const axisRange = $derived(computeAxisRange(layers));
  const activeLayerIds = $derived(timelineSelection.activeLayerIds);

  function setCollapsed(collapsed: boolean): void {
    isCollapsed = collapsed;
    oncollapsed?.(collapsed);
  }
</script>

<div class="timeline-shell">
  {#if isCollapsed}
    <Button
      class="timeline-reopen"
      iconOnly
      variant="prominent"
      aria-label={t().timeline.open}
      onclick={() => setCollapsed(false)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 14 6-6 6 6"></path>
      </svg>
    </Button>
  {:else}
    <Window class="timeline-window" style="--window-radius: var(--radius-control);" variant="docked" placement="bottom">
      <div class="track">
        <TimeAxis range={axisRange} onclose={() => setCollapsed(true)} />
        <Meanders {layers} range={axisRange} {activeLayerIds} onLayerClick={(layerId) => timelineSelection.toggleLayer(layerId)} />
      </div>
    </Window>
  {/if}
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
    margin-inline: var(--space-4);
  }

  :global(.timeline-reopen) {
    align-self: flex-end;
    margin: 0 auto;
    --button-height: 2rem;
  }

  :global(.timeline-reopen svg) {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .track {
    --track-width: 100%;
    --timeline-line-width: 4px;

    position: relative;
    width: var(--track-width);
    height: 100%;
  }
</style>
