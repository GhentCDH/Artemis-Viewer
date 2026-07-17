<script lang="ts">
  import type { Snippet } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import Window from './Window.svelte';

  let {
    map,
    lngLat,
    onclose,
    closeOn = 'move',
    revealOnAnchorVisible = false,
    interactive = false,
    title = '',
    showClose = false,
    closeLabel = undefined,
    windowStyle = '',
    class: className = '',
    style = '',
    header,
    children,
  }: {
    map: maplibregl.Map;
    lngLat: [number, number];
    onclose: () => void;
    /** 'move' closes as soon as any camera gesture starts; 'drag' closes only on
     * user drags, so programmatic camera flights keep the bubble and reposition it. */
    closeOn?: 'move' | 'drag';
    /** Stay hidden until the anchor first enters the pane (for bubbles opened while
     * the camera is still flying to their pin), then close once it leaves again. */
    revealOnAnchorVisible?: boolean;
    /** Whole window receives pointer events. When false the bubble is display-only:
     * clicks fall through to the map, and individual controls opt back in. */
    interactive?: boolean;
    title?: string;
    showClose?: boolean;
    closeLabel?: string;
    /** Per-instance overrides of Window's exposed variables (width, max-height, …). */
    windowStyle?: string;
    class?: string;
    style?: string;
    header?: Snippet;
    children?: Snippet;
  } = $props();

  // Positioning math runs in viewport px (getBoundingClientRect space), like Tooltip.
  const VIEWPORT_MARGIN = 12;
  const ANCHOR_GAP = 12;
  const ARROW_INSET = 20;

  let anchor = $state<{ x: number; y: number } | null>(null);
  let anchorSeen = $state(false);
  let bubbleWidth = $state(0);
  let bubbleHeight = $state(0);

  const placeBelow = $derived(anchor !== null && anchor.y - ANCHOR_GAP - bubbleHeight < VIEWPORT_MARGIN);
  const bubbleLeft = $derived.by(() => {
    if (anchor === null) return 0;
    const maxLeft = document.documentElement.clientWidth - VIEWPORT_MARGIN - bubbleWidth;
    return Math.min(Math.max(anchor.x - bubbleWidth / 2, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxLeft));
  });
  const bubbleTop = $derived(
    anchor === null ? 0 : placeBelow ? anchor.y + ANCHOR_GAP : anchor.y - ANCHOR_GAP - bubbleHeight
  );
  const arrowLeft = $derived(
    anchor === null
      ? 0
      : Math.min(Math.max(anchor.x - bubbleLeft, ARROW_INSET), Math.max(ARROW_INSET, bubbleWidth - ARROW_INSET))
  );
  const ready = $derived(anchor !== null && (anchorSeen || !revealOnAnchorVisible) && bubbleWidth > 0);

  $effect(() => {
    let closeFrame: number | null = null;
    const update = () => {
      const point = map.project(lngLat);
      const paneRect = map.getContainer().getBoundingClientRect();
      anchor = { x: paneRect.left + point.x, y: paneRect.top + point.y };
      if (!revealOnAnchorVisible) return;
      const inside = point.x >= 0 && point.y >= 0 && point.x <= paneRect.width && point.y <= paneRect.height;
      if (inside) anchorSeen = true;
      else if (anchorSeen) onclose();
    };
    // Deferred a frame so the movestart racing the opening click can't close it instantly.
    const closeAfterGestureStarts = () => {
      if (closeFrame !== null) return;
      closeFrame = requestAnimationFrame(() => onclose());
    };
    const closeOnDrag = () => onclose();
    update();
    map.on('move', update);
    map.on('resize', update);
    if (closeOn === 'drag') map.on('dragstart', closeOnDrag);
    else map.on('movestart', closeAfterGestureStarts);
    window.addEventListener('resize', update);
    return () => {
      if (closeFrame !== null) cancelAnimationFrame(closeFrame);
      map.off('move', update);
      map.off('resize', update);
      if (closeOn === 'drag') map.off('dragstart', closeOnDrag);
      else map.off('movestart', closeAfterGestureStarts);
      window.removeEventListener('resize', update);
    };
  });
</script>

{#if anchor !== null}
  <div
    class={`preview-bubble ${className}`}
    class:preview-bubble--below={placeBelow}
    class:preview-bubble--ready={ready}
    {style}
    style:left="{bubbleLeft}px"
    style:top="{bubbleTop}px"
    bind:clientWidth={bubbleWidth}
    bind:clientHeight={bubbleHeight}
  >
    <Window
      variant="popover"
      placement="anchored"
      closeOnEscape
      {title}
      {showClose}
      {closeLabel}
      {onclose}
      {header}
      style={`--window-pointer-events: ${interactive ? 'auto' : 'none'}; ${windowStyle}`}
    >
      {@render children?.()}
    </Window>
    <div class="preview-bubble-arrow" style:left="{arrowLeft}px" aria-hidden="true"></div>
  </div>
{/if}

<style>
  .preview-bubble {
    /* -- exposed -- */
    --preview-bubble-arrow-size: 0.75rem;
    /* Matches the Window popover variant's surface mix so the arrow reads as part of it. */
    --preview-bubble-arrow-bg: color-mix(in srgb, var(--color-surface-raised) 98%, var(--color-surface-tint));
    /* -- end exposed -- */

    /* Pass-through wrapper: the map keeps receiving clicks/drags unless the Window
       opts in via `interactive` (or an inner control via its own pointer-events). */
    position: fixed;
    z-index: var(--z-popover);
    pointer-events: none;
    visibility: hidden;
  }

  .preview-bubble--ready {
    visibility: visible;
  }

  /* Rotated square whose protruding half forms the pointer; the borders on the two
     tip-facing sides continue the window's outline, and its body covers the window
     border where they overlap (hence sitting above the Window in paint order). */
  .preview-bubble-arrow {
    position: absolute;
    bottom: calc(var(--preview-bubble-arrow-size) / -2);
    z-index: calc(var(--z-popover) + 1);
    width: var(--preview-bubble-arrow-size);
    height: var(--preview-bubble-arrow-size);
    transform: translateX(-50%) rotate(45deg);
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--preview-bubble-arrow-bg);
  }

  .preview-bubble--below .preview-bubble-arrow {
    top: calc(var(--preview-bubble-arrow-size) / -2);
    bottom: auto;
    border-right: none;
    border-bottom: none;
    border-top: 1px solid var(--color-border);
    border-left: 1px solid var(--color-border);
  }
</style>
