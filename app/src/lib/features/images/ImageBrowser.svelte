<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { browser } from '$app/environment';
  import { format, t } from '$lib/shared/i18n/i18n.svelte';
  import { hideTooltip, showTooltip } from '$lib/shared/tooltip.svelte';
  import MetadataInfoWindow from '$lib/shared/metadata/MetadataInfoWindow.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import { loadImageCollectionDetails, loadImageCollections, type ImageCollectionDetails } from '$lib/features/search/searchIndex';
  import type { ImageResult } from '$lib/features/search/searchTypes';
  import { attachImagePinInteraction, removeImagePins, syncImagePins } from './imagePins';
  import { imageBrowser } from './imageBrowserState.svelte';
  import { spriteBackgroundPosition, spriteBackgroundSize } from './sprites';
  import ImagePreviewBubble from './ImagePreviewBubble.svelte';

  let {
    map,
    onOpenImage,
    showControls = true,
  }: {
    map: maplibregl.Map | null;
    onOpenImage?: (image: ImageResult) => void;
    showControls?: boolean;
  } = $props();

  let loading = $state(true);
  let images = $state<ImageResult[]>([]);
  let imagesInView = $state<ImageResult[]>([]);
  let filterStart = $state(0);
  let filterEnd = $state(0);
  let collectionsOpen = $state(false);
  // Unchecked collections; new collections default to checked. Reassigned as a
  // whole on toggle since Set contents aren't deeply reactive.
  let excludedCollections = $state<ReadonlySet<string>>(new Set());
  let collectionDetails = $state<ImageCollectionDetails[]>([]);
  let openInfoCollectionId = $state<string | null>(null);
  let yearTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  /* Match sublayer info: dismiss once the pointer moves more than 6rem away. */
  const detailCloseDistance =
    6 * (browser ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 16);

  $effect(() => () => {
    if (yearTooltipTimer !== null) clearTimeout(yearTooltipTimer);
  });

  const openInfoCollection = $derived(
    collectionDetails.find((collection) => collection.id === openInfoCollectionId) ?? null
  );

  // Deferred until the panel first opens: the collection indexes, sprite metadata, and pin
  // resources serve only this panel and its pins, so a session that never opens it skips the
  // fetches and map-style work entirely. Search results reach pins via imageBrowser.showPreview,
  // which opens the panel and therefore triggers the same load.
  let collectionsRequested = $state(false);
  $effect(() => {
    if (!imageBrowser.panelOpen || collectionsRequested) return;
    collectionsRequested = true;
    void loadImageCollectionDetails().then((details) => {
      collectionDetails = details;
    });
    void loadImageCollections().then((loaded) => {
      images = loaded;
      const years = loaded.map((image) => Number.parseInt(image.year, 10)).filter((year) => Number.isFinite(year));
      filterStart = years.length > 0 ? Math.min(...years) : 0;
      filterEnd = years.length > 0 ? Math.max(...years) : 0;
      loading = false;
    });
  });

  const datedYears = $derived(
    images
      .map((image) => Number.parseInt(image.year, 10))
      .filter((year) => Number.isFinite(year))
  );
  const yearMin = $derived(datedYears.length > 0 ? Math.min(...datedYears) : 0);
  const yearMax = $derived(datedYears.length > 0 ? Math.max(...datedYears) : 0);
  const hasYearRange = $derived(yearMin !== yearMax);
  const collections = $derived.by(() => {
    const byId = new Map<string, string>();
    for (const image of images) {
      if (!byId.has(image.collectionId)) byId.set(image.collectionId, image.collectionLabel);
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
  const selectedCollectionCount = $derived(
    collections.filter((collection) => !excludedCollections.has(collection.id)).length
  );
  const filteredImages = $derived(
    imagesInView.filter((image) => {
      if (excludedCollections.has(image.collectionId)) return false;
      const year = Number.parseInt(image.year, 10);
      return !Number.isFinite(year) || !hasYearRange || (year >= filterStart && year <= filterEnd);
    })
  );

  function updateImagesInView(): void {
    if (!map) {
      imagesInView = [];
      return;
    }
    const bounds = map.getBounds();
    // Decorate-sort-undecorate keeps year parsing at O(n) instead of per comparison.
    imagesInView = images
      .flatMap((image) => {
        if (image.lon === null || image.lat === null || !bounds.contains([image.lon, image.lat])) return [];
        const year = Number.parseInt(image.year, 10);
        return [{ image, year: Number.isFinite(year) ? year : Number.POSITIVE_INFINITY }];
      })
      .sort((a, b) => (a.year - b.year) || a.image.title.localeCompare(b.image.title))
      .map((entry) => entry.image);
  }

  // The in-view list only feeds the open panel, so it recomputes on settled cameras
  // (moveend) while the panel is showing — not on every move frame of every gesture.
  $effect(() => {
    if (!map || !imageBrowser.panelOpen) return;
    images;
    updateImagesInView();
    map.on('moveend', updateImagesInView);
    return () => {
      map.off('moveend', updateImagesInView);
    };
  });

  $effect(() => {
    if (!map || !collectionsRequested) return;
    const sync = () => syncImagePins(map, images, imageBrowser.panelOpen);
    sync();
    map.on('styledata', sync);
    return () => {
      map.off('styledata', sync);
      removeImagePins(map);
    };
  });

  $effect(() => {
    if (!map || !collectionsRequested) return;
    return attachImagePinInteraction(map, (imageId) => {
      const image = imageId === null ? undefined : images.find((candidate) => candidate.id === imageId);
      if (image) imageBrowser.showPreview(image);
      else imageBrowser.closePreview();
    });
  });

  function setFilterStart(value: number): void {
    if (!Number.isFinite(value)) return;
    filterStart = Math.min(Math.max(value, yearMin), filterEnd);
  }

  function setOpen(nextOpen: boolean): void {
    imageBrowser.setPanelOpen(nextOpen);
    if (!nextOpen) openInfoCollectionId = null;
  }

  function toggleCollectionInfo(collectionId: string): void {
    openInfoCollectionId = openInfoCollectionId === collectionId ? null : collectionId;
  }

  function setFilterEnd(value: number): void {
    if (!Number.isFinite(value)) return;
    filterEnd = Math.max(Math.min(value, yearMax), filterStart);
  }

  function adjustFilterStart(step: number): void {
    setFilterStart(filterStart + step);
  }

  function adjustFilterEnd(step: number): void {
    setFilterEnd(filterEnd + step);
  }

  function showYearSanitizedTooltip(input: HTMLInputElement, text: string): void {
    const rect = input.getBoundingClientRect();
    showTooltip({ text, x: rect.left + rect.width / 2, y: rect.top, placement: 'above' });
    if (yearTooltipTimer !== null) clearTimeout(yearTooltipTimer);
    yearTooltipTimer = setTimeout(() => {
      hideTooltip();
      yearTooltipTimer = null;
    }, 2500);
  }

  function updateYearInput(event: Event, target: 'start' | 'end'): void {
    const input = event.currentTarget as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = digits;
    if (digits.length !== 4) return;
    const value = Number(digits);
    if (target === 'start') setFilterStart(value);
    else setFilterEnd(value);
    const sanitizedValue = target === 'start' ? filterStart : filterEnd;
    input.value = String(sanitizedValue);
    if (sanitizedValue !== value) {
      showYearSanitizedTooltip(
        input,
        format(t().images.yearSanitized, { year: sanitizedValue })
      );
    }
  }

  function sanitizeYearInput(event: Event, target: 'start' | 'end'): void {
    const input = event.currentTarget as HTMLInputElement;
    const sanitizedValue = target === 'start' ? filterStart : filterEnd;
    if (input.value.length !== 4) {
      showYearSanitizedTooltip(
        input,
        format(t().images.yearRequiresFourDigits, { year: sanitizedValue })
      );
    }
    input.value = String(sanitizedValue);
  }

  function toggleCollection(collectionId: string): void {
    const next = new Set(excludedCollections);
    if (next.has(collectionId)) next.delete(collectionId);
    else next.add(collectionId);
    excludedCollections = next;
  }

  function focusImage(image: ImageResult): void {
    if (image.lon === null || image.lat === null || !map) return;
    map.flyTo({ center: [image.lon, image.lat], zoom: Math.max(map.getZoom(), 15) });
    imageBrowser.showPreview(image);
  }
</script>

<div class="image-browser">
  {#if showControls}
    <Button
      variant="prominent"
      active={imageBrowser.panelOpen}
      class="image-browser-trigger"
      aria-label={imageBrowser.panelOpen
        ? format(t().images.inViewAria, { count: imagesInView.length })
        : t().images.trigger}
      aria-expanded={imageBrowser.panelOpen}
      onclick={() => setOpen(!imageBrowser.panelOpen)}
    >
      <svg class="image-browser-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="2"></rect>
        <circle cx="8.2" cy="9.3" r="1.7"></circle>
        <path d="m5.5 16.5 4.2-4.2 3.2 3 2.3-2.2 3.3 3.4"></path>
      </svg>
      <span class="image-browser-trigger-text">{t().images.trigger}</span>
    </Button>
  {/if}

  {#if showControls && imageBrowser.panelOpen}
    <div class="image-browser-panel-layer">
      {#if openInfoCollection}
        <div class="collection-detail-layer">
          <MetadataInfoWindow
            title={openInfoCollection.label}
            subtitle={openInfoCollection.provider}
            description={openInfoCollection.description}
            furtherReading={openInfoCollection.furtherReading}
            sources={openInfoCollection.sources}
            closeOnPointerDistance={detailCloseDistance}
            onclose={() => (openInfoCollectionId = null)}
            style="--window-width: min(21rem, calc(100vw - var(--image-browser-width) - (3 * var(--space-3)))); --window-max-height: var(--image-browser-max-height); --window-header-border-width: 0px;"
          />
        </div>
      {/if}
      <Window
        title={t().images.windowTitle}
        subtitle={format(t().images.visibleCount, { shown: filteredImages.length, total: imagesInView.length })}
        placement="right"
        showClose
        closeOnEscape={imageBrowser.preview === null}
        onclose={() => setOpen(false)}
        style="--window-width: var(--image-browser-width); --window-height: var(--image-browser-panel-height); --window-max-height: var(--image-browser-panel-height); --window-header-border-width: 0px;"
      >
        <div class="image-browser-body">
          <WaveSeparator />
          {#if hasYearRange}
            <div class="year-filter" aria-label={t().images.yearFilterAria}>
              <div class="year-control">
                <span>{t().images.from}</span>
                <div class="year-input-row">
                  <input
                    aria-label={t().images.from}
                    type="text"
                    inputmode="numeric"
                    maxlength="4"
                    pattern="[0-9]{4}"
                    value={filterStart}
                    oninput={(event) => updateYearInput(event, 'start')}
                    onchange={(event) => sanitizeYearInput(event, 'start')}
                  />
                  <Button
                    iconOnly
                    aria-label={t().images.increaseStartYear}
                    disabled={filterStart === filterEnd}
                    onclick={() => adjustFilterStart(1)}
                  >↑</Button>
                  <Button
                    iconOnly
                    aria-label={t().images.decreaseStartYear}
                    disabled={filterStart === yearMin}
                    onclick={() => adjustFilterStart(-1)}
                  >↓</Button>
                </div>
              </div>
              <div class="year-control">
                <span>{t().images.to}</span>
                <div class="year-input-row">
                  <input
                    aria-label={t().images.to}
                    type="text"
                    inputmode="numeric"
                    maxlength="4"
                    pattern="[0-9]{4}"
                    value={filterEnd}
                    oninput={(event) => updateYearInput(event, 'end')}
                    onchange={(event) => sanitizeYearInput(event, 'end')}
                  />
                  <Button
                    iconOnly
                    aria-label={t().images.increaseEndYear}
                    disabled={filterEnd === yearMax}
                    onclick={() => adjustFilterEnd(1)}
                  >↑</Button>
                  <Button
                    iconOnly
                    aria-label={t().images.decreaseEndYear}
                    disabled={filterEnd === filterStart}
                    onclick={() => adjustFilterEnd(-1)}
                  >↓</Button>
                </div>
              </div>
            </div>
          {/if}

          {#if collections.length > 0}
            <div class="collection-filter">
              <Button
                class="collection-filter-trigger"
                active={collectionsOpen}
                aria-expanded={collectionsOpen}
                onclick={() => {
                  collectionsOpen = !collectionsOpen;
                  if (!collectionsOpen) openInfoCollectionId = null;
                }}
              >
                <span class="collection-filter-label">
                  {selectedCollectionCount === collections.length
                    ? t().images.collections
                    : format(t().images.collectionsFiltered, { selected: selectedCollectionCount, total: collections.length })}
                </span>
                <svg class="collection-filter-chevron" class:collection-filter-chevron--open={collectionsOpen} viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 6 4 4 4-4"></path>
                </svg>
              </Button>
              {#if collectionsOpen}
                <div class="collection-options" role="group" aria-label={t().images.collectionFilterAria}>
                  {#each collections as collection (collection.id)}
                    {@const infoOpen = openInfoCollectionId === collection.id}
                    {@const hasDetails = collectionDetails.some((detail) => detail.id === collection.id)}
                    <div class="collection-option-row">
                      <label class="collection-option">
                        <input
                          type="checkbox"
                          checked={!excludedCollections.has(collection.id)}
                          onchange={() => toggleCollection(collection.id)}
                        />
                        <span>{collection.label}</span>
                      </label>
                      {#if hasDetails}
                        <Button
                          class="collection-info-button"
                          iconOnly
                          aria-expanded={infoOpen}
                          aria-label={format(infoOpen ? t().images.collectionInfoHide : t().images.collectionInfoShow, { name: collection.label })}
                          onclick={() => toggleCollectionInfo(collection.id)}
                          style="--button-bg: transparent; --button-bg-hover: transparent; --button-border: transparent; --button-border-hover: transparent; --button-text: var(--color-text-muted); --button-height: 1.75rem;"
                        >
                          <svg class="collection-info-icon" viewBox="0 0 16 16" aria-hidden="true">
                            <circle cx="8" cy="8" r="6"></circle>
                            <path d="M8 7.2v3.8"></path>
                            <path d="M8 4.9h.01"></path>
                          </svg>
                        </Button>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if hasYearRange || collections.length > 0}
            <div class="section-separator"><WaveSeparator /></div>
          {/if}

          {#if loading}
            <p class="image-status">{t().images.loading}</p>
          {:else if filteredImages.length === 0}
            <p class="image-status">{t().images.noneVisible}</p>
          {:else}
            <div class="image-list">
              {#each filteredImages as image (image.id)}
                <Button variant="list" onclick={() => focusImage(image)}>
                  {#if image.sprite}
                    <span
                      class="image-thumbnail"
                      role="img"
                      aria-label={format(t().images.previewOf, { title: image.title })}
                      style:background-image={`url("${image.sprite.imageUrl.replaceAll('"', '%22')}")`}
                      style:background-size={spriteBackgroundSize(image.sprite)}
                      style:background-position={spriteBackgroundPosition(image.sprite)}
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

  {#if map && imageBrowser.preview}
    {#key imageBrowser.preview.id}
      <ImagePreviewBubble
        {map}
        image={imageBrowser.preview}
        onclose={() => imageBrowser.closePreview()}
        onopen={(image) => onOpenImage?.(image)}
      />
    {/key}
  {/if}
</div>

<style>
  .image-browser {
    /* -- exposed -- */
    --image-browser-width: min(22rem, calc(100vw - (2 * var(--space-3))));
    --image-browser-trigger-height: var(--canvas-primary-control-height);
    --image-browser-panel-available-height: calc(
      100dvh - var(--canvas-timeline-bottom) - var(--canvas-timeline-height) - (2 * var(--space-4)) -
        (2 * var(--image-browser-trigger-height)) - var(--space-2) - var(--space-3)
    );
    --image-browser-panel-height: var(--image-browser-panel-available-height);
    --image-browser-max-height: var(--image-browser-panel-height);
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
    flex: 0 0 auto;
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

  /* Own wrapper element anchored beside the Landscapes window, so the detail
     never participates in the panel layer's flow (positioning the Window
     itself via a :global class ties with Window's own position rule at equal
     specificity and is unreliable — see the branding trigger's note). */
  .collection-detail-layer {
    position: absolute;
    top: 0;
    right: calc(100% + var(--space-3));
  }

  .image-browser-body {
    position: relative;
    display: flex;
    height: 100%;
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

  .collection-filter {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: 0 var(--space-4) var(--space-2);
  }

  .collection-filter :global(.collection-filter-trigger) {
    --button-width: 100%;
    --button-height: 2rem;
  }

  /* Spreads the trigger's own content (label left, chevron right) without
     overriding Button's internal layout. */
  .collection-filter-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collection-filter-chevron {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 150ms ease;
  }

  .collection-filter-chevron--open {
    transform: rotate(180deg);
  }

  .collection-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--color-shadow-ink) 16%, transparent);
    background: var(--color-surface-tint);
  }

  .collection-option-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .collection-option {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    min-width: 0;
    min-height: 1.75rem;
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .collection-info-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .collection-option input[type='checkbox'] {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    margin: 0;
    accent-color: var(--color-accent);
    cursor: pointer;
  }

  .collection-option input[type='checkbox']:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .collection-option span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .year-control {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
  }

  .year-control input {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding-inline: var(--space-2);
    background: var(--color-surface-control);
    color: var(--color-text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }

  .year-control input:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .year-input-row {
    display: flex;
    gap: var(--space-1);
  }

  .year-input-row input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .year-input-row :global(.button) {
    --button-width: 2.5rem;
    --button-height: 2.5rem;

    flex: 0 0 auto;
    font-size: var(--text-md);
  }

  .image-list {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    overflow: auto;
  }

  /* Rows scrolled out of view skip layout and paint entirely; the intrinsic size
     placeholder matches a row's natural height (thumbnail + the list button's block
     padding) so the scrollbar doesn't jump as rows enter the viewport. */
  .image-list > :global(.button) {
    content-visibility: auto;
    contain-intrinsic-size: auto calc(var(--image-thumbnail-height) + 2 * var(--space-1));
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

  .image-title {
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    font-weight: 400;
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

    .image-browser-trigger-text {
      display: none;
    }

    :global(.image-browser-panel-layer .window-heading) {
      display: none;
    }

    :global(.image-browser-panel-layer .window-header) {
      justify-content: flex-end;
      padding: var(--space-2);
    }

    .image-meta {
      display: none;
    }

    .image-row {
      justify-content: center;
    }
  }

  @media (max-width: 40rem) {
    .image-browser {
      --image-browser-panel-height: min(50dvh, var(--image-browser-panel-available-height));
    }

    .image-browser-panel-layer {
      position: fixed;
      top: calc(var(--space-3) + var(--image-browser-trigger-height) + var(--space-2));
      right: var(--space-3);
    }

    .year-filter {
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
    }
  }
</style>
