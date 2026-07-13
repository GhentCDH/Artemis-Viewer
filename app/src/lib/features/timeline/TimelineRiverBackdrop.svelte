<script lang="ts">
  const RIVER_SPLINE = 'M -90 16 C 8 -8, 107 70, 205 82 C 303 94, 402 8, 500 2 C 598 -4, 697 106, 795 99 C 893 92, 992 38, 1090 24';
</script>

<div class="timeline-river-backdrop" aria-hidden="true">
  <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
    <path class="river-spline river-spline--wide" d={RIVER_SPLINE}></path>
    <path class="river-spline river-spline--middle" d={RIVER_SPLINE}></path>
    <path class="river-spline river-spline--narrow" d={RIVER_SPLINE}></path>
  </svg>
</div>

<style>
  .timeline-river-backdrop {
    /* -- exposed -- */
    --timeline-river-wide-color: color-mix(in srgb, var(--color-timeline-active) 2%, transparent);
    --timeline-river-middle-color: color-mix(in srgb, var(--color-timeline-active) 3.5%, transparent);
    --timeline-river-narrow-color: color-mix(in srgb, var(--color-timeline-active) 5%, transparent);
    --timeline-river-wide-width: 120;
    --timeline-river-middle-width: 70;
    --timeline-river-narrow-width: 35;
    /* -- end exposed -- */

    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .river-spline {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .river-spline--wide {
    stroke: var(--timeline-river-wide-color);
    stroke-width: var(--timeline-river-wide-width);
  }

  .river-spline--middle {
    stroke: var(--timeline-river-middle-color);
    stroke-width: var(--timeline-river-middle-width);
  }

  .river-spline--narrow {
    stroke: var(--timeline-river-narrow-color);
    stroke-width: var(--timeline-river-narrow-width);
  }
</style>
