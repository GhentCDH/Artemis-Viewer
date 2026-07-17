<script lang="ts">
  import { onMount } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import { t } from '$lib/shared/i18n/i18n.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import PreviewBubble from '$lib/shared/primitives/PreviewBubble.svelte';
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

  const PREVIEW_HEIGHT_REM = 13.75;
  const PREVIEW_MIN_WIDTH_REM = 13.75;
  const PREVIEW_MAX_WIDTH_REM = 22.5;

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
  const lngLat = $derived<[number, number] | null>(
    image.lon === null || image.lat === null ? null : [image.lon, image.lat]
  );

  // The parent keys this component by image id, so one load per bubble instance.
  onMount(() => {
    void loadImagePreviewUrl(image.manifestUrl).then(
      (url) => (previewUrl = url),
      () => (previewFailed = true)
    );
  });

  $effect(() => {
    if (lngLat === null) onclose();
  });

  function handlePreviewLoad(event: Event): void {
    previewLoaded = true;
    const element = event.currentTarget as HTMLImageElement;
    if (element.naturalWidth > 0 && element.naturalHeight > 0) {
      measuredAspect = element.naturalWidth / element.naturalHeight;
    }
  }
</script>

{#if lngLat !== null}
  <PreviewBubble
    {map}
    {lngLat}
    {onclose}
    closeOn="drag"
    revealOnAnchorVisible
    windowStyle={`--window-width: min(${previewWidthRem}rem, calc(100dvw - 2 * var(--space-3)));`}
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
        <p class="image-preview-status">
          {previewFailed ? t().images.previewUnavailable : t().images.loadingPreview}
        </p>
      {/if}
    </div>
    <div class="image-preview-actions">
      <Button
        variant="prominent"
        onclick={() => onopen(image)}
        style="--button-width: 100%; --button-height: 2.25rem;"
      >{t().images.openInViewer}</Button>
    </div>
  </PreviewBubble>
{/if}

<style>
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
    --image-preview-height: 13.75rem;

    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--image-preview-height);
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
</style>
