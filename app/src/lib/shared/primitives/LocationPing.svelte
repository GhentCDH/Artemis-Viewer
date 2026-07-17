<script lang="ts">
  import type maplibregl from 'maplibre-gl';

  let {
    map,
    lngLat,
    oncomplete,
  }: {
    map: maplibregl.Map;
    lngLat: [number, number];
    oncomplete?: () => void;
  } = $props();

  let position = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    const update = () => {
      const point = map.project(lngLat);
      const pane = map.getContainer().getBoundingClientRect();
      position = { x: pane.left + point.x, y: pane.top + point.y };
    };

    update();
    map.on('move', update);
    map.on('resize', update);
    window.addEventListener('resize', update);

    return () => {
      map.off('move', update);
      map.off('resize', update);
      window.removeEventListener('resize', update);
    };
  });
</script>

{#if position}
  <div
    class="location-ping"
    style:left="{position.x}px"
    style:top="{position.y}px"
    aria-hidden="true"
    onanimationend={oncomplete}
  >
    <span class="location-ping-ring"></span>
    <span class="location-ping-core"></span>
  </div>
{/if}

<style>
  .location-ping {
    /* -- exposed -- */
    --location-ping-size: 3rem;
    --location-ping-core-size: var(--space-2);
    --location-ping-duration: 0.7s;
    --location-ping-count: 3;
    /* -- end exposed -- */

    position: fixed;
    z-index: var(--z-overlay);
    width: var(--location-ping-size);
    height: var(--location-ping-size);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .location-ping-ring,
  .location-ping-core {
    position: absolute;
    inset: 50% auto auto 50%;
    border-radius: 50%;
    background: var(--color-accent);
    transform: translate(-50%, -50%);
  }

  .location-ping-ring {
    width: 100%;
    height: 100%;
    animation: location-ping var(--location-ping-duration) ease-out var(--location-ping-count);
  }

  .location-ping-core {
    width: var(--location-ping-core-size);
    height: var(--location-ping-core-size);
    box-shadow: 0 0 0 2px var(--color-accent-contrast);
  }

  @keyframes location-ping {
    from {
      opacity: 0.65;
      transform: translate(-50%, -50%) scale(0.15);
    }

    to {
      opacity: 0;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .location-ping-ring {
      animation-duration: 0.01s;
    }
  }
</style>
