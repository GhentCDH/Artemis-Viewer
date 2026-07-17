<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { format, t } from '$lib/shared/i18n/i18nStore.svelte';

  let { map }: { map: maplibregl.Map | null } = $props();

  let scaleTrack = $state<HTMLDivElement | null>(null);
  let distanceLabel = $state('');
  let barWidth = $state(0);
  // Written by the ResizeObserver below. updateIndicator runs on every `move` frame during
  // pans/zooms, and measuring with getBoundingClientRect there forces a layout mid-gesture.
  let trackWidth = 0;

  const EQUATORIAL_METERS_PER_PIXEL = 156543.03392;

  function formatDistance(distanceMeters: number): string {
    if (distanceMeters >= 1000) {
      const kilometers = distanceMeters / 1000;
      return Number.isInteger(kilometers) ? `${kilometers} km` : `${kilometers.toFixed(1)} km`;
    }
    return `${Math.round(distanceMeters)} m`;
  }

  function chooseNiceDistance(maximumMeters: number): number {
    if (!Number.isFinite(maximumMeters) || maximumMeters <= 0) return 0;
    const magnitude = 10 ** Math.floor(Math.log10(maximumMeters));
    for (const step of [5, 2, 1]) {
      const candidate = step * magnitude;
      if (candidate <= maximumMeters) return candidate;
    }
    return magnitude / 2;
  }

  function clearIndicator(): void {
    distanceLabel = '';
    barWidth = 0;
  }

  function updateIndicator(): void {
    if (!map || !scaleTrack) {
      clearIndicator();
      return;
    }

    const zoom = map.getZoom();
    const latitudeRadians = (map.getCenter().lat * Math.PI) / 180;
    const metersPerPixel = (EQUATORIAL_METERS_PER_PIXEL * Math.cos(latitudeRadians)) / 2 ** zoom;
    const maximumWidth = trackWidth;
    const distance = chooseNiceDistance(metersPerPixel * maximumWidth);

    if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0 || maximumWidth <= 0 || distance <= 0) {
      clearIndicator();
      return;
    }

    distanceLabel = formatDistance(distance);
    barWidth = Math.min(100, (distance / metersPerPixel / maximumWidth) * 100);
  }

  $effect(() => {
    const activeMap = map;
    if (!activeMap) {
      clearIndicator();
      return;
    }

    updateIndicator();
    activeMap.on('move', updateIndicator);
    return () => activeMap.off('move', updateIndicator);
  });

  $effect(() => {
    if (!scaleTrack) return;
    const resizeObserver = new ResizeObserver((entries) => {
      trackWidth = entries[entries.length - 1]?.contentRect.width ?? 0;
      updateIndicator();
    });
    resizeObserver.observe(scaleTrack);
    return () => resizeObserver.disconnect();
  });
</script>

<div
  class="scale-indicator"
  role="img"
  aria-label={distanceLabel ? format(t().controls.mapScale, { distance: distanceLabel }) : undefined}
>
  {#if distanceLabel}
    <span class="scale-indicator-distance">{distanceLabel}</span>
  {/if}
  <div class="scale-indicator-track" bind:this={scaleTrack}>
    {#if distanceLabel}
      <div class="scale-indicator-bar" style={`width: ${barWidth}%`}></div>
    {/if}
  </div>
</div>

<style>
  .scale-indicator {
    /* -- exposed -- */
    --scale-indicator-max-width: 7.5rem;
    --scale-indicator-marker-height: var(--space-2);
    /* -- end exposed -- */

    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    width: var(--scale-indicator-max-width);
    pointer-events: none;
    user-select: none;
  }

  .scale-indicator-distance {
    color: var(--color-text-secondary);
    font-size: var(--text-2xs);
    line-height: 1;
    white-space: nowrap;
  }

  .scale-indicator-track {
    width: var(--scale-indicator-max-width);
    height: var(--scale-indicator-marker-height);
  }

  .scale-indicator-bar {
    position: relative;
    margin-left: auto;
    height: var(--scale-indicator-marker-height);
    border-right: 2px solid var(--color-text-secondary);
    border-bottom: 2px solid var(--color-text-secondary);
    border-left: 2px solid var(--color-text-secondary);
  }
</style>
