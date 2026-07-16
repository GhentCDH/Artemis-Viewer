<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import type { OverlayFeatureInfo } from '$lib/core/map/basemap';
  import Window from '$lib/shared/primitives/Window.svelte';
  import { t } from '$lib/shared/i18n/i18n.svelte';

  let {
    map,
    lngLat,
    info,
    onclose,
  }: {
    map: maplibregl.Map;
    lngLat: [number, number];
    info: OverlayFeatureInfo;
    onclose: () => void;
  } = $props();

  const VIEWPORT_MARGIN = 12;
  const ANCHOR_GAP = 12;
  const ARROW_INSET = 20;

  let anchor = $state({ x: 0, y: 0 });
  let bubbleWidth = $state(0);
  let bubbleHeight = $state(0);
  const entries = $derived(Object.entries(info.properties).filter(([, value]) => value !== null && value !== ''));
  const placeBelow = $derived(anchor.y - ANCHOR_GAP - bubbleHeight < VIEWPORT_MARGIN);
  const bubbleLeft = $derived.by(() => {
    const maxLeft = document.documentElement.clientWidth - VIEWPORT_MARGIN - bubbleWidth;
    return Math.min(Math.max(anchor.x - bubbleWidth / 2, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxLeft));
  });
  const bubbleTop = $derived(placeBelow ? anchor.y + ANCHOR_GAP : anchor.y - ANCHOR_GAP - bubbleHeight);
  const arrowLeft = $derived(
    Math.min(Math.max(anchor.x - bubbleLeft, ARROW_INSET), Math.max(ARROW_INSET, bubbleWidth - ARROW_INSET))
  );

  function formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  $effect(() => {
    let closeFrame: number | null = null;
    const update = () => {
      const point = map.project(lngLat);
      const paneRect = map.getContainer().getBoundingClientRect();
      anchor = { x: paneRect.left + point.x, y: paneRect.top + point.y };
    };
    const closeAfterGestureStarts = () => {
      if (closeFrame !== null) return;
      closeFrame = requestAnimationFrame(() => onclose());
    };
    update();
    map.on('move', update);
    map.on('resize', update);
    map.on('movestart', closeAfterGestureStarts);
    window.addEventListener('resize', update);
    return () => {
      if (closeFrame !== null) cancelAnimationFrame(closeFrame);
      map.off('move', update);
      map.off('resize', update);
      map.off('movestart', closeAfterGestureStarts);
      window.removeEventListener('resize', update);
    };
  });
</script>

<div
  class="overlay-feature-bubble"
  class:overlay-feature-bubble--below={placeBelow}
  style:left="{bubbleLeft}px"
  style:top="{bubbleTop}px"
  bind:clientWidth={bubbleWidth}
  bind:clientHeight={bubbleHeight}
>
  <Window
    variant="popover"
    placement="anchored"
    title={info.title}
    showClose
    closeLabel={t().basemap.closeFeatureInfo}
    closeOnEscape
    {onclose}
    style="--window-width: min(24rem, calc(100dvw - 2 * var(--space-3))); --window-max-height: min(28rem, calc(100dvh - 2 * var(--space-3)));"
  >
    {#if entries.length === 0}
      <p class="feature-empty">{t().basemap.noFeatureAttributes}</p>
    {:else}
      <dl class="feature-properties">
        {#each entries as [name, value] (name)}
          <div class="feature-property">
            <dt>{name}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </Window>
  <div class="overlay-feature-arrow" style:left="{arrowLeft}px" aria-hidden="true"></div>
</div>

<style>
  .overlay-feature-bubble {
    /* -- exposed -- */
    --overlay-feature-arrow-size: 0.75rem;
    --overlay-feature-arrow-bg: color-mix(in srgb, var(--color-surface-raised) 98%, var(--color-surface-tint));
    /* -- end exposed -- */

    position: fixed;
    z-index: var(--z-popover);
    pointer-events: none;
  }

  .overlay-feature-bubble :global(.window) {
    pointer-events: auto;
  }

  .feature-properties {
    max-height: 20rem;
    margin: 0;
    overflow: auto;
  }

  .feature-property {
    display: grid;
    grid-template-columns: minmax(6rem, 0.4fr) minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
  }

  .feature-property:first-child {
    border-top: 0;
  }

  .feature-property dt {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .feature-property dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    white-space: pre-wrap;
  }

  .feature-empty {
    margin: 0;
    padding: var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .overlay-feature-arrow {
    position: absolute;
    bottom: calc(var(--overlay-feature-arrow-size) / -2);
    z-index: calc(var(--z-popover) + 1);
    width: var(--overlay-feature-arrow-size);
    height: var(--overlay-feature-arrow-size);
    transform: translateX(-50%) rotate(45deg);
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--overlay-feature-arrow-bg);
  }

  .overlay-feature-bubble--below .overlay-feature-arrow {
    top: calc(var(--overlay-feature-arrow-size) / -2);
    bottom: auto;
    border-right: 0;
    border-bottom: 0;
    border-top: 1px solid var(--color-border);
    border-left: 1px solid var(--color-border);
  }
</style>
