<script lang="ts">
  import type maplibregl from 'maplibre-gl';

  let { map }: { map: maplibregl.Map | null } = $props();

  let zoomLevel = $state('');

  function updateZoomLevel(): void {
    zoomLevel = map ? map.getZoom().toFixed(1) : '';
  }

  $effect(() => {
    const activeMap = map;
    if (!activeMap) {
      zoomLevel = '';
      return;
    }

    updateZoomLevel();
    activeMap.on('move', updateZoomLevel);
    return () => activeMap.off('move', updateZoomLevel);
  });
</script>

{#if zoomLevel}
  <div class="zoom-indicator" role="img" aria-label={`Zoom level ${zoomLevel}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5"></circle>
      <path d="m15.5 15.5 5 5"></path>
    </svg>
    <span>{zoomLevel}</span>
  </div>
{/if}

<style>
  .zoom-indicator {
    /* -- exposed -- */
    --zoom-indicator-icon-size: var(--text-xs);
    --zoom-indicator-gap: var(--space-1);
    /* -- end exposed -- */

    display: inline-flex;
    align-items: center;
    gap: var(--zoom-indicator-gap);
    pointer-events: none;
    user-select: none;
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    line-height: 1;
    white-space: nowrap;
  }

  .zoom-indicator svg {
    width: var(--zoom-indicator-icon-size);
    height: var(--zoom-indicator-icon-size);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
</style>
