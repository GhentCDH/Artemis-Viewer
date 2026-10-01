<script lang="ts">
  import { t } from '$lib/shared/i18n/i18nStore.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import { DEFAULT_AXIS_RANGE, getAxisTicks, yearToPercent, type AxisRange } from './timelineScale';

  let {
    range = DEFAULT_AXIS_RANGE,
    onclose,
  }: {
    range?: AxisRange;
    onclose?: () => void;
  } = $props();

  const ticks = $derived(getAxisTicks(range));
</script>

<div class="time-axis">
  <Button
    class="axis-close"
    iconOnly
    variant="quiet"
    aria-label={t().timeline.close}
    onclick={() => onclose?.()}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 10 6 6 6-6"></path>
    </svg>
  </Button>
  <div class="axis-line"></div>
  {#each ticks as year (year)}
    <div class="axis-tick" style="left: {yearToPercent(year, range)}%">
      <span class="axis-tick-mark"></span>
      <span class="axis-tick-label">{year}</span>
    </div>
  {/each}
</div>

<style>
  .time-axis {
    position: relative;
    width: 100%;
    height: 100%;
  }

  :global(.axis-close) {
    position: absolute;
    z-index: 1;
    top: var(--space-1);
    left: 50%;
    transform: translateX(-50%);
    --button-height: 1.75rem;
    --button-text: var(--color-text-muted);
  }

  :global(.axis-close svg) {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .axis-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: var(--timeline-line-width, 3px);
    transform: translateY(-50%);
    background: var(--color-timeline-axis);
  }

  .axis-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
  }

  .axis-tick-mark {
    position: absolute;
    top: 0;
    bottom: var(--space-5);
    left: 50%;
    width: 1px;
    transform: translateX(-50%);
    background: var(--color-timeline-tick);
  }

  .axis-tick-label {
    position: absolute;
    bottom: var(--space-1);
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
    color: var(--color-timeline-tick-label);
    white-space: nowrap;
  }
</style>
