<script lang="ts">
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import { showTooltip, hideTooltip } from '$lib/shared/primitives/tooltipState.svelte';
  import { format, t } from '$lib/shared/i18n/i18n.svelte';
  import { DEFAULT_AXIS_RANGE, yearToPercent, type AxisRange } from './timelineScale';
  import { layoutMeanders, type MeanderPill } from './meanderLayout';
  import TimelineScanPath, {
    SCAN_BAND_WIDTH_PERCENT,
  } from './TimelineScanPath.svelte';

  let {
    layers = [],
    range = DEFAULT_AXIS_RANGE,
    activeLayerIds = [],
    onLayerClick,
  }: {
    layers?: LayerSummary[];
    range?: AxisRange;
    activeLayerIds?: string[];
    onLayerClick?: (layerId: string) => void;
  } = $props();

  const pills = $derived(layoutMeanders(layers));
  const activeLayerIdSet = $derived(new Set(activeLayerIds));

  function localScanBandWidth(spanPercent: number): number {
    return (SCAN_BAND_WIDTH_PERCENT / spanPercent) * 100;
  }

  function localScanPosition(globalPercent: number, leftPercent: number, spanPercent: number): number {
    return ((globalPercent - leftPercent) / spanPercent) * 100;
  }

  function onPillEnter(pill: MeanderPill, event: MouseEvent) {
    const rect = (event.currentTarget as SVGGeometryElement).getBoundingClientRect();
    showTooltip({
      text: `${pill.label} · ${pill.startYear}–${pill.endYear}`,
      x: rect.left + rect.width / 2,
      y: pill.direction === 'above' ? rect.top : rect.bottom,
      placement: pill.direction,
    });
  }
</script>

<div class="meanders">
  {#if pills.length > 0}
    <svg class="axis-scan-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <TimelineScanPath
        id="axis"
        d="M 0 50 H 100"
      />
    </svg>
  {/if}
  {#each pills as pill (pill.id)}
    {@const left = yearToPercent(pill.visualStartYear, range)}
    {@const width = yearToPercent(pill.visualEndYear, range) - left}
    {@const active = activeLayerIdSet.has(pill.id)}
    <button
      type="button"
      class="meander-pill meander-pill--{pill.direction}"
      class:is-active={active}
      class:is-inactive={!active}
      style="left: {left}%; width: {width}%"
      aria-label={format(active ? t().timeline.pillDeactivate : t().timeline.pillActivate, { label: pill.label, startYear: pill.startYear, endYear: pill.endYear })}
      aria-pressed={active}
      onclick={() => onLayerClick?.(pill.id)}
    >
      <svg class="meander-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="meander-active-gradient-{pill.id}" x1="0" x2="100" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" class="meander-active-gradient-stop meander-active-gradient-stop--edge"></stop>
            <stop offset="50%" class="meander-active-gradient-stop meander-active-gradient-stop--apex"></stop>
            <stop offset="100%" class="meander-active-gradient-stop meander-active-gradient-stop--edge"></stop>
          </linearGradient>
          <linearGradient id="meander-active-falloff-gradient-{pill.id}" x1="0" x2="100" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="black"></stop>
            <stop offset="50%" stop-color="white"></stop>
            <stop offset="100%" stop-color="black"></stop>
          </linearGradient>
          <mask id="meander-active-falloff-mask-{pill.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <rect
              x="0"
              y="0"
              width="100"
              height="100"
              fill="url(#meander-active-falloff-gradient-{pill.id})"
            ></rect>
          </mask>
        </defs>
        <path
          class="meander-hit"
          role="presentation"
          d={pill.path}
          onmouseenter={(event) => onPillEnter(pill, event)}
          onmouseleave={hideTooltip}
        ></path>
        <path
          class="meander-curve"
          d={pill.path}
        ></path>
        <path
          class="meander-current"
          d={pill.path}
          stroke="url(#meander-active-gradient-{pill.id})"
        ></path>
        <path
          class="meander-active-apex"
          d={pill.path}
          mask="url(#meander-active-falloff-mask-{pill.id})"
        ></path>
        <path
          class="meander-active-flow"
          d={pill.path}
        ></path>
      </svg>
      <svg class="meander-scan-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <TimelineScanPath
          id={pill.id}
          d={pill.path}
          bandWidthPercent={localScanBandWidth(width)}
          startPositionPercent={localScanPosition(0, left, width)}
          endPositionPercent={localScanPosition(100, left, width)}
        />
      </svg>
      <span class="meander-dot" style="top: {pill.apexY}%"></span>
      <span class="meander-label" style="top: {pill.apexY}%">{pill.label}</span>
    </button>
  {/each}
</div>

<style>
  .meanders {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .meander-pill {
    position: absolute;
    margin: 0;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    pointer-events: none;
  }

  .axis-scan-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .meander-pill.is-inactive .meander-svg {
    opacity: 0.4;
    filter: grayscale(0.6);
  }

  .meander-pill--above {
    top: var(--space-5);
    bottom: 50%;
  }

  .meander-pill--below {
    top: 50%;
    bottom: var(--space-5);
  }

  .meander-svg,
  .meander-scan-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .meander-scan-svg {
    pointer-events: none;
  }

  .meander-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12px;
    vector-effect: non-scaling-stroke;
    pointer-events: stroke;
  }

  .meander-curve {
    fill: none;
    stroke: var(--color-timeline-axis);
    stroke-width: var(--timeline-line-width, 3px);
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    transition:
      opacity 200ms ease,
      stroke-width 200ms ease;
    pointer-events: none;
  }

  .meander-current,
  .meander-active-apex,
  .meander-active-flow {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .meander-current {
    opacity: 0;
    stroke-width: var(--timeline-line-width, 3px);
    transition: opacity 200ms ease;
  }

  .meander-active-apex {
    opacity: 0;
    stroke: var(--color-timeline-active);
    stroke-width: calc(var(--timeline-line-width, 3px) * 1.48);
    transition: opacity 200ms ease;
  }

  .meander-active-flow {
    opacity: 0;
    stroke: color-mix(in srgb, var(--color-timeline-active) 28%, var(--color-surface-raised));
    stroke-width: calc(var(--timeline-line-width, 3px) * 0.38);
    stroke-dasharray: calc(var(--timeline-line-width, 3px) * 0.19) calc(var(--timeline-line-width, 3px) * 1.48);
    stroke-dashoffset: 0;
    transition: opacity 200ms ease;
  }

  .meander-active-gradient-stop--edge {
    stop-color: var(--color-timeline-axis);
  }

  .meander-active-gradient-stop--apex {
    stop-color: var(--color-timeline-active);
  }

  .meander-dot {
    position: absolute;
    left: 50%;
    width: 0.4375rem;
    height: 0.4375rem;
    border: 1px solid var(--color-surface-raised);
    border-radius: var(--radius-pill);
    background: var(--color-timeline-axis);
    transform: translate(-50%, -50%);
  }

  .meander-pill.is-active .meander-dot {
    width: 1rem;
    height: 1rem;
    border-width: 0.1875rem;
    background: var(--color-timeline-active);
  }

  .meander-pill.is-active .meander-current,
  .meander-pill.is-active .meander-active-apex {
    opacity: 1;
  }

  .meander-pill.is-active .meander-active-flow {
    opacity: 0.95;
    animation: meander-flow 1.1s linear infinite;
  }

  .meander-label {
    position: absolute;
    left: 50%;
    white-space: nowrap;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .meander-pill.is-active .meander-label {
    color: var(--color-text-primary);
  }

  .meander-pill:focus-visible .meander-curve {
    stroke: var(--color-accent-hover);
  }

  @keyframes meander-flow {
    from {
      stroke-dashoffset: 0;
    }

    to {
      stroke-dashoffset: -32;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .meander-pill.is-active .meander-active-flow {
      animation: none;
    }
  }

  .meander-pill--above .meander-label {
    transform: translate(-50%, calc(-100% - var(--space-1)));
  }

  .meander-pill--below .meander-label {
    transform: translate(-50%, var(--space-1));
  }

  /* Portrait windows are too narrow for the labels not to collide; the hover
     tooltip still names each meander. */
  @media (orientation: portrait) {
    .meander-label {
      display: none;
    }
  }
</style>
