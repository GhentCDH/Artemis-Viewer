<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import { loadImageCollections } from '$lib/features/search/searchIndex';
  import type { ImageResult } from '$lib/features/search/searchTypes';
  import { removeImagePins, syncImagePins } from './imagePins';

  let {
    map,
    open = false,
    onOpenChange,
  }: {
    map: maplibregl.Map | null;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  } = $props();

  let loading = $state(true);
  let images = $state<ImageResult[]>([]);
  let imagesInView = $state<ImageResult[]>([]);
  let filterStart = $state(0);
  let filterEnd = $state(0);

  const datedYears = $derived(
    images
      .map((image) => Number.parseInt(image.year, 10))
      .filter((year) => Number.isFinite(year))
  );
  const yearMin = $derived(datedYears.length > 0 ? Math.min(...datedYears) : 0);
  const yearMax = $derived(datedYears.length > 0 ? Math.max(...datedYears) : 0);
  const hasYearRange = $derived(yearMin !== yearMax);
  const filteredImages = $derived(
    imagesInView.filter((image) => {
      const year = Number.parseInt(image.year, 10);
      return !Number.isFinite(year) || !hasYearRange || (year >= filterStart && year <= filterEnd);
    })
  );

  void loadImageCollections().then((loaded) => {
    images = loaded;
    const years = loaded.map((image) => Number.parseInt(image.year, 10)).filter((year) => Number.isFinite(year));
    filterStart = years.length > 0 ? Math.min(...years) : 0;
    filterEnd = years.length > 0 ? Math.max(...years) : 0;
    loading = false;
  });

  function updateImagesInView(): void {
    if (!map) {
      imagesInView = [];
      return;
    }
    const bounds = map.getBounds();
    imagesInView = images
      .filter((image) => image.lon !== null && image.lat !== null && bounds.contains([image.lon, image.lat]))
      .sort((a, b) => {
        const aYear = Number.parseInt(a.year, 10);
        const bYear = Number.parseInt(b.year, 10);
        const yearDifference = (Number.isFinite(aYear) ? aYear : Number.POSITIVE_INFINITY) -
          (Number.isFinite(bYear) ? bYear : Number.POSITIVE_INFINITY);
        return yearDifference || a.title.localeCompare(b.title);
      });
  }

  $effect(() => {
    if (!map) return;
    images;
    updateImagesInView();
    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateImagesInView();
      });
    };
    map.on('move', scheduleUpdate);
    return () => {
      map.off('move', scheduleUpdate);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    if (!map) return;
    const sync = () => syncImagePins(map, images, open);
    sync();
    map.on('styledata', sync);
    return () => {
      map.off('styledata', sync);
      removeImagePins(map);
    };
  });

  function setFilterStart(value: number): void {
    if (!Number.isFinite(value)) return;
    filterStart = Math.min(Math.max(value, yearMin), filterEnd);
  }

  function setOpen(nextOpen: boolean): void {
    onOpenChange?.(nextOpen);
  }

  function setFilterEnd(value: number): void {
    if (!Number.isFinite(value)) return;
    filterEnd = Math.max(Math.min(value, yearMax), filterStart);
  }

  function focusImage(image: ImageResult): void {
    if (image.lon === null || image.lat === null || !map) return;
    map.flyTo({ center: [image.lon, image.lat], zoom: Math.max(map.getZoom(), 15) });
  }

  function spriteBackgroundSize(image: ImageResult): string {
    if (!image.sprite) return 'auto';
    return `${(image.sprite.sheetWidth / image.sprite.width) * 100}% ${(image.sprite.sheetHeight / image.sprite.height) * 100}%`;
  }

  function spriteBackgroundPosition(image: ImageResult): string {
    if (!image.sprite) return '0% 0%';
    const horizontalRange = image.sprite.sheetWidth - image.sprite.width;
    const verticalRange = image.sprite.sheetHeight - image.sprite.height;
    const x = horizontalRange > 0 ? (image.sprite.x / horizontalRange) * 100 : 0;
    const y = verticalRange > 0 ? (image.sprite.y / verticalRange) * 100 : 0;
    return `${x}% ${y}%`;
  }
</script>

<div class="image-browser">
  <Button
    class="image-browser-trigger"
    aria-label="Images in view ({imagesInView.length})"
    aria-expanded={open}
    onclick={() => setOpen(!open)}
  >
    <svg class="image-browser-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2"></rect>
      <circle cx="8.2" cy="9.3" r="1.7"></circle>
      <path d="m5.5 16.5 4.2-4.2 3.2 3 2.3-2.2 3.3 3.4"></path>
    </svg>
    <span class="image-browser-trigger-text">Images ({imagesInView.length})</span>
  </Button>

  {#if open}
    <div class="image-browser-panel-layer">
      <Window
        title="Images in view"
        subtitle={`${filteredImages.length} of ${imagesInView.length} visible images`}
        placement="right"
        showClose
        closeOnEscape
        onclose={() => setOpen(false)}
        style="--window-width: var(--image-browser-width); --window-max-height: var(--image-browser-max-height); --window-header-border-width: 0px;"
      >
        <div class="image-browser-body">
          <WaveSeparator />
          {#if hasYearRange}
            <div class="year-filter" aria-label="Filter images by year">
              <label>
                <span>From</span>
                <input
                  type="number"
                  min={yearMin}
                  max={filterEnd}
                  value={filterStart}
                  onchange={(event) => setFilterStart(event.currentTarget.valueAsNumber)}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="number"
                  min={filterStart}
                  max={yearMax}
                  value={filterEnd}
                  onchange={(event) => setFilterEnd(event.currentTarget.valueAsNumber)}
                />
              </label>
            </div>
            <div class="section-separator"><WaveSeparator /></div>
          {/if}

          {#if loading}
            <p class="image-status">Loading images…</p>
          {:else if filteredImages.length === 0}
            <p class="image-status">No images are visible in the current map area.</p>
          {:else}
            <div class="image-list">
              {#each filteredImages as image (image.id)}
                <Button variant="list" onclick={() => focusImage(image)}>
                  {#if image.sprite}
                    <span
                      class="image-thumbnail"
                      role="img"
                      aria-label={`Preview of ${image.title}`}
                      style:background-image={`url("${image.sprite.imageUrl.replaceAll('"', '%22')}")`}
                      style:background-size={spriteBackgroundSize(image)}
                      style:background-position={spriteBackgroundPosition(image)}
                    ></span>
                  {:else}
                    <span class="image-thumbnail image-thumbnail--empty" aria-hidden="true"></span>
                  {/if}
                  <span class="image-row">
                    <span class="image-title">{image.title}</span>
                    <span class="image-meta">{[image.year, image.location].filter(Boolean).join(' · ') || image.collectionLabel}</span>
                  </span>
                </Button>
              {/each}
            </div>
          {/if}
        </div>
      </Window>
    </div>
  {/if}
</div>

<style>
  .image-browser {
    /* -- exposed -- */
    --image-browser-width: 22rem;
    --image-browser-trigger-height: var(--canvas-primary-control-height);
    --image-browser-max-height: calc(
      100vh - var(--canvas-timeline-bottom) - var(--canvas-timeline-height) - var(--space-4) -
        var(--image-browser-trigger-height) - var(--space-4)
    );
    --image-thumbnail-width: 3rem;
    --image-thumbnail-height: 2.25rem;
    /* -- end exposed -- */

    position: relative;
    display: flex;
    pointer-events: auto;
  }

  /* Descendant selector (not inline style) so the portrait media query below can
     override these; the extra specificity beats the Button defaults outright. */
  .image-browser :global(.image-browser-trigger) {
    --button-height: var(--image-browser-trigger-height);
    --button-padding-inline: var(--canvas-primary-control-padding-inline);
    --button-gap: var(--canvas-primary-control-gap);
    --button-font-size: var(--canvas-primary-control-font-size);
  }

  .image-browser-icon {
    display: none;
    width: calc(1rem * 1.5);
    height: calc(1rem * 1.5);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .image-browser-panel-layer {
    position: absolute;
    top: calc(var(--image-browser-trigger-height) + var(--space-2));
    right: 0;
  }

  .image-browser-body {
    position: relative;
    display: flex;
    min-height: 0;
    flex-direction: column;
  }

  .year-filter {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .section-separator {
    position: relative;
    flex: 0 0 1rem;
    height: 1rem;
  }

  .year-filter label {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
  }

  .year-filter input {
    width: 100%;
    min-height: 1.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-2);
    background: var(--color-surface-control);
    color: var(--color-text-primary);
    font: inherit;
  }

  .image-list {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    overflow: auto;
  }

  .image-row {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
  }

  .image-thumbnail {
    flex: 0 0 var(--image-thumbnail-width);
    width: var(--image-thumbnail-width);
    height: var(--image-thumbnail-height);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface-control-hover);
    background-repeat: no-repeat;
  }

  .image-thumbnail--empty {
    border: 1px solid var(--color-border-subtle);
  }

  .image-title,
  .image-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .image-meta {
    color: var(--color-text-muted);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
  }

  .image-status {
    margin: 0;
    padding: var(--space-6) var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  /* Portrait windows are too narrow for labelled controls: collapse the trigger
     to a square icon-only button, matching the compare/search/branding controls.
     Last in the stylesheet so it outranks the base rules above. */
  @media (orientation: portrait) {
    .image-browser :global(.image-browser-trigger) {
      --button-width: var(--image-browser-trigger-height);
      --button-padding-inline: 0rem;
    }

    .image-browser-icon {
      display: block;
    }

    .image-browser-trigger-text {
      display: none;
    }
  }
</style>
