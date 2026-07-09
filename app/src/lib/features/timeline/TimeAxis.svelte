<script lang="ts">
  import { DEFAULT_AXIS_RANGE, getAxisTicks, yearToPercent, type AxisRange } from './timelineScale';

  let { range = DEFAULT_AXIS_RANGE }: { range?: AxisRange } = $props();

  const ticks = $derived(getAxisTicks(range));
</script>

<div class="time-axis">
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
