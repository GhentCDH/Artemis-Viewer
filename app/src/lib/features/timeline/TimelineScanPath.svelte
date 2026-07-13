<script module lang="ts">
  export const SCAN_PULSE_COUNT = 3;
  export const SCAN_PULSE_GAP_SECONDS = 1.2;
  export const SCAN_TRAVEL_SECONDS = 2.35;
  export const SCAN_BAND_WIDTH_PERCENT = 20;
</script>

<script lang="ts">
  let {
    id,
    d,
    bandWidthPercent = SCAN_BAND_WIDTH_PERCENT,
    startPositionPercent = 0,
    endPositionPercent = 100,
  }: {
    id: string;
    d: string;
    bandWidthPercent?: number;
    startPositionPercent?: number;
    endPositionPercent?: number;
  } = $props();

  function scanDelay(index: number): string {
    return `${index * SCAN_PULSE_GAP_SECONDS}s`;
  }
</script>

<g
  class="timeline-scan"
  style="--timeline-scan-band-width: {bandWidthPercent}%; --timeline-scan-duration: {SCAN_TRAVEL_SECONDS}s; --timeline-scan-start-offset: {startPositionPercent - bandWidthPercent}%; --timeline-scan-end-offset: {endPositionPercent}%;"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="timeline-scan-gradient-{id}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="white" stop-opacity="0"></stop>
      <stop offset="42%" stop-color="white" stop-opacity="0.72"></stop>
      <stop offset="50%" stop-color="white"></stop>
      <stop offset="58%" stop-color="white" stop-opacity="0.72"></stop>
      <stop offset="100%" stop-color="white" stop-opacity="0"></stop>
    </linearGradient>
    {#each Array(SCAN_PULSE_COUNT) as _, index}
      <mask id="timeline-scan-mask-{id}-{index}" maskUnits="userSpaceOnUse" x="-2000" y="-20" width="4100" height="140">
        <rect
          class="timeline-scan-mask"
          style="--timeline-scan-delay: {scanDelay(index)};"
          fill="url(#timeline-scan-gradient-{id})"
        ></rect>
      </mask>
    {/each}
  </defs>
  {#each Array(SCAN_PULSE_COUNT) as _, index}
    <path
      class="timeline-scan-path"
      style="--timeline-scan-delay: {scanDelay(index)};"
      {d}
      mask="url(#timeline-scan-mask-{id}-{index})"
    ></path>
  {/each}
</g>

<style>
  .timeline-scan {
    /* -- exposed -- */
    --timeline-scan-band-width: 18%;
    --timeline-scan-color: color-mix(in srgb, var(--color-timeline-active) 35%, var(--color-text-primary));
    --timeline-scan-stroke-width: calc(var(--timeline-line-width, 0.1875rem) * 1.42);
    /* -- end exposed -- */

    pointer-events: none;
  }

  .timeline-scan-mask {
    x: 0;
    y: -10%;
    width: var(--timeline-scan-band-width);
    height: 120%;
    transform-box: view-box;
    animation: timeline-scan-mask var(--timeline-scan-duration) linear both;
    animation-delay: var(--timeline-scan-delay);
  }

  .timeline-scan-path {
    fill: none;
    stroke: var(--timeline-scan-color);
    stroke-width: var(--timeline-scan-stroke-width);
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  @keyframes timeline-scan-mask {
    from {
      transform: translateX(var(--timeline-scan-start-offset));
    }

    to {
      transform: translateX(var(--timeline-scan-end-offset));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .timeline-scan-path,
    .timeline-scan-mask {
      display: none;
      animation: none;
    }
  }
</style>
