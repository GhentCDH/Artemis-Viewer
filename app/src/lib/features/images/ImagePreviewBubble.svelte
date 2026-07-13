<script lang="ts">
  import { onMount } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import type { ImageResult } from '$lib/features/search/searchTypes';
  import { loadImagePreviewUrl } from './imagePreview';
  import { spriteBackgroundPosition, spriteBackgroundSize } from './sprites';

  let {
    map,
    image,
    onclose,
    onopen,
  }: {
    map: maplibregl.Map;
    image: ImageResult;
    onclose: () => void;
    onopen: (image: ImageResult) => void;
  } = $props();

  // Positioning math runs in viewport px (getBoundingClientRect space), like Tooltip.
  const VIEWPORT_MARGIN = 12;
  const ANCHOR_GAP = 12;
  const ARROW_INSET = 20;
  const PREVIEW_HEIGHT_REM = 13.75;
  const PREVIEW_MIN_WIDTH_REM = 13.75;
  const PREVIEW_MAX_WIDTH_REM = 22.5;

  let anchor = $state<{ x: number; y: number } | null>(null);
  // Bubbles opened from the panel or search may start with their pin off-screen while
  // the camera flies to it: stay hidden until the anchor first enters the pane, and
  // only auto-close on leaving after that.
  let anchorSeen = $state(false);
  let bubbleWidth = $state(0);
  let bubbleHeight = $state(0);
  let previewUrl = $state<string | null>(null);
  let previewLoaded = $state(false);
  let previewFailed = $state(false);
  let measuredAspect = $state<number | null>(null);

  const metaLine = $derived([image.year, image.location].filter(Boolean).join(' · '));
  const previewAspect = $derived(
    image.sprite ? image.sprite.width / image.sprite.height : (measuredAspect ?? 4 / 3)
  );
  const previewWidthRem = $derived(
    Math.min(Math.max(previewAspect * PREVIEW_HEIGHT_REM, PREVIEW_MIN_WIDTH_REM), PREVIEW_MAX_WIDTH_REM)
  );

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
  const ready = $derived(anchor !== null && anchorSeen && bubbleWidth > 0);

  // The parent keys this component by image id, so one load per bubble instance.
  onMount(() => {
    void loadImagePreviewUrl(image.manifestUrl).then(
      (url) => (previewUrl = url),
      () => (previewFailed = true)
    );
  });

  $effect(() => {
    const { lon, lat } = image;
    if (lon === null || lat === null) {
      onclose();
      return;
    }
    const update = () => {
      const point = map.project([lon, lat]);
      const paneRect = map.getContainer().getBoundingClientRect();
      const inside = point.x >= 0 && point.y >= 0 && point.x <= paneRect.width && point.y <= paneRect.height;
      anchor = { x: paneRect.left + point.x, y: paneRect.top + point.y };
      if (inside) anchorSeen = true;
      else if (anchorSeen) onclose();
    };
    // Dragging dismisses outright; programmatic camera flights (search/panel fly-ins)
    // don't fire dragstart, so they keep the bubble and just reposition it.
    const closeOnDrag = () => onclose();
    update();
    map.on('move', update);
    map.on('resize', update);
    map.on('dragstart', closeOnDrag);
    window.addEventListener('resize', update);
    return () => {
      map.off('move', update);
      map.off('resize', update);
      map.off('dragstart', closeOnDrag);
      window.removeEventListener('resize', update);
    };
  });

  function handlePreviewLoad(event: Event): void {
    previewLoaded = true;
    const element = event.currentTarget as HTMLImageElement;
    if (element.naturalWidth > 0 && element.naturalHeight > 0) {
      measuredAspect = element.naturalWidth / element.naturalHeight;
    }
  }
</script>

{#if anchor !== null}
  <div
    class="image-preview-bubble"
    class:image-preview-bubble--below={placeBelow}
    class:image-preview-bubble--ready={ready}
    style:left="{bubbleLeft}px"
    style:top="{bubbleTop}px"
    style="--image-bubble-preview-width: {previewWidthRem}rem; --image-bubble-preview-height: {PREVIEW_HEIGHT_REM}rem;"
    bind:clientWidth={bubbleWidth}
    bind:clientHeight={bubbleHeight}
  >
    <Window
      variant="popover"
      placement="anchored"
      closeOnEscape
      {onclose}
      style="--window-width: min(var(--image-bubble-preview-width), calc(100dvw - 2 * var(--space-3))); --window-pointer-events: none;"
    >
      {#snippet header()}
        <div class="image-preview-heading">
          <p class="image-preview-kicker">{image.collectionLabel}</p>
          <h2 class="image-preview-title">{image.title}</h2>
          {#if metaLine}
            <p class="image-preview-meta">{metaLine}</p>
          {/if}
        </div>
      {/snippet}

      <div class="image-preview-frame">
        {#if image.sprite}
          <span
            class="image-preview-placeholder"
            aria-hidden="true"
            style:background-image={`url("${image.sprite.imageUrl.replaceAll('"', '%22')}")`}
            style:background-size={spriteBackgroundSize(image.sprite)}
            style:background-position={spriteBackgroundPosition(image.sprite)}
          ></span>
        {/if}
        {#if previewUrl}
          <img
            class="image-preview-full"
            class:image-preview-full--loaded={previewLoaded}
            src={previewUrl}
            alt={image.title}
            onload={handlePreviewLoad}
            onerror={() => (previewFailed = true)}
          />
        {/if}
        {#if !image.sprite && !previewLoaded}
          <p class="image-preview-status">{previewFailed ? 'Preview unavailable' : 'Loading preview…'}</p>
        {/if}
      </div>
      <div class="image-preview-actions">
        <Button
          variant="prominent"
          onclick={() => onopen(image)}
          style="--button-width: 100%; --button-height: 2.25rem;"
        >Open in viewer</Button>
      </div>
    </Window>
    <div class="image-preview-arrow" style:left="{arrowLeft}px" aria-hidden="true"></div>
  </div>
{/if}

<style>
  .image-preview-bubble {
    /* -- exposed -- */
    --image-bubble-preview-width: 17rem;
    --image-bubble-preview-height: 13.75rem;
    --image-bubble-arrow-size: 0.75rem;
    /* Matches the Window popover variant's surface mix so the arrow reads as part of it. */
    --image-bubble-arrow-bg: color-mix(in srgb, var(--color-surface-raised) 98%, var(--color-surface-tint));
    /* -- end exposed -- */

    /* Display-only surface: clicks and drags fall through to the map (which closes the
       bubble); the open-in-viewer Button opts itself back in via its own pointer-events. */
    position: fixed;
    z-index: var(--z-popover);
    pointer-events: none;
    visibility: hidden;
  }

  .image-preview-bubble--ready {
    visibility: visible;
  }

  .image-preview-heading {
    min-width: 0;
  }

  .image-preview-kicker {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .image-preview-title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    margin: var(--space-1) 0 0;
    font-size: var(--text-sm);
    font-weight: 400;
    line-height: 1.3;
  }

  .image-preview-meta {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
  }

  .image-preview-frame {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--image-bubble-preview-height);
    overflow: hidden;
    background: var(--color-surface-control);
  }

  .image-preview-placeholder {
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
  }

  .image-preview-full {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 200ms ease;
  }

  .image-preview-full--loaded {
    opacity: 1;
  }

  .image-preview-status {
    position: relative;
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .image-preview-actions {
    padding: var(--space-3) var(--space-4);
  }

  /* Rotated square whose protruding half forms the pointer; the borders on the two
     tip-facing sides continue the window's outline, and its body covers the window
     border where they overlap (hence sitting above the Window in paint order). */
  .image-preview-arrow {
    position: absolute;
    bottom: calc(var(--image-bubble-arrow-size) / -2);
    z-index: calc(var(--z-popover) + 1);
    width: var(--image-bubble-arrow-size);
    height: var(--image-bubble-arrow-size);
    transform: translateX(-50%) rotate(45deg);
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--image-bubble-arrow-bg);
  }

  .image-preview-bubble--below .image-preview-arrow {
    top: calc(var(--image-bubble-arrow-size) / -2);
    bottom: auto;
    border-right: none;
    border-bottom: none;
    border-top: 1px solid var(--color-border);
    border-left: 1px solid var(--color-border);
  }
</style>
