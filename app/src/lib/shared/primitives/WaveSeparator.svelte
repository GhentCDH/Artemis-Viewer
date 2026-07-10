<script lang="ts">
  let { class: className = '', style = '' }: { class?: string; style?: string } = $props();
</script>

<svg
  class={`wave-separator ${className}`}
  {style}
  viewBox="0 0 100 16"
  preserveAspectRatio="none"
  aria-hidden="true"
>
  <path d="M -20 10 C 0 10, 0 4, 20 4 S 40 10, 60 10 S 80 4, 100 4 S 120 10, 140 10"></path>
</svg>

<style>
  .wave-separator {
    /* -- exposed -- */
    --wave-separator-height: 1rem;
    --wave-separator-stroke: color-mix(in srgb, var(--color-timeline-axis) 34%, transparent);
    --wave-separator-stroke-width: 1px;
    /* -- end exposed -- */

    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: var(--wave-separator-height);
    overflow: visible;
    pointer-events: none;
  }

  path {
    fill: none;
    stroke: var(--wave-separator-stroke);
    stroke-width: var(--wave-separator-stroke-width);
    vector-effect: non-scaling-stroke;
  }
</style>
