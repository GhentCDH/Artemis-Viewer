<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { format, t } from '$lib/shared/i18n/i18n.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Toggle from '$lib/shared/primitives/Toggle.svelte';
  import { datasetUrl } from '$lib/core/dataset/dataSource';
  import { timelineSelection } from '$lib/features/timeline/timelineSelection.svelte';
  import { loadSearchIndex } from './searchIndex';
  import { searchByText } from './searchScoring';
  import { focusSearchResult, type SearchFocusTarget } from './searchSelection';
  import type { ImageResult, ScoredResult, SearchIndex, SearchResult, SheetResult, ToponymResult } from './searchTypes';

  let {
    leftMap,
    rightMap,
    onfocus,
  }: {
    leftMap: maplibregl.Map | null;
    rightMap: maplibregl.Map | null;
    onfocus?: (target: SearchFocusTarget) => void;
  } = $props();

  type Tab = 'all' | 'toponyms' | 'sheets' | 'images';


  let expanded = $state(false);
  let query = $state('');
  let loading = $state(false);
  let activeTab = $state<Tab>('all');
  let activeOnly = $state(false);
  let index = $state<SearchIndex | null>(null);
  let inputElement = $state<HTMLInputElement | undefined>(undefined);

  const trimmedQuery = $derived(query.trim());
  const activeLayerIds = $derived(new Set(timelineSelection.activeLayerIds));

  const emptyToponymMatches: ScoredResult<ToponymResult>[] = [];
  const emptySheetMatches: ScoredResult<SheetResult>[] = [];
  const emptyImageMatches: ScoredResult<ImageResult>[] = [];

  const toponymMatches = $derived(
    index && trimmedQuery ? searchByText(index.toponyms, trimmedQuery, (item) => item.text) : emptyToponymMatches
  );
  const sheetMatches = $derived(
    index && trimmedQuery ? searchByText(index.sheets, trimmedQuery, (item) => item.label) : emptySheetMatches
  );
  const imageMatches = $derived(
    index && trimmedQuery
      ? searchByText(index.images, trimmedQuery, (item) => [item.title, item.location, item.year, item.collectionLabel].filter(Boolean).join(' '))
      : emptyImageMatches
  );

  const visibleToponyms = $derived(
    activeOnly ? toponymMatches.filter((match) => activeLayerIds.has(match.item.layerId)) : toponymMatches
  );
  const visibleSheets = $derived(
    activeOnly ? sheetMatches.filter((match) => activeLayerIds.has(match.item.layerId)) : sheetMatches
  );

  const showToponyms = $derived(activeTab === 'all' || activeTab === 'toponyms');
  const showSheets = $derived(activeTab === 'all' || activeTab === 'sheets');
  const showImages = $derived(activeTab === 'all' || activeTab === 'images');
  const groupedToponyms = $derived(showToponyms ? groupByLayer(visibleToponyms) : []);
  const groupedSheets = $derived(showSheets ? groupByLayer(visibleSheets) : []);
  const groupedImages = $derived(showImages ? groupByCollection(imageMatches) : []);
  const totalVisible = $derived(
    (showToponyms ? visibleToponyms.length : 0) +
      (showSheets ? visibleSheets.length : 0) +
      (showImages ? imageMatches.length : 0)
  );

  function groupByLayer<T extends { item: { layerLabel: string } }>(matches: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const match of matches) {
      const list = groups.get(match.item.layerLabel);
      if (list) list.push(match);
      else groups.set(match.item.layerLabel, [match]);
    }
    return [...groups.entries()];
  }

  function groupByCollection<T extends { item: { collectionLabel: string } }>(matches: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const match of matches) {
      const list = groups.get(match.item.collectionLabel);
      if (list) list.push(match);
      else groups.set(match.item.collectionLabel, [match]);
    }
    return [...groups.entries()];
  }

  function ensureIndexLoaded(): void {
    if (index || loading) return;
    loading = true;
    void loadSearchIndex(datasetUrl('layers.yaml'))
      .then((loaded) => {
        index = loaded;
      })
      .finally(() => {
        loading = false;
      });
  }

  $effect(() => {
    if (expanded) inputElement?.focus();
  });

  function open(): void {
    expanded = true;
    ensureIndexLoaded();
  }

  function close(): void {
    expanded = false;
  }

  function toggle(): void {
    if (expanded) close();
    else open();
  }

  function select(result: SearchResult): void {
    const target = focusSearchResult(result, { leftMap, rightMap });
    if (target) onfocus?.(target);
    query = result.kind === 'toponym' ? result.text : result.kind === 'image' ? result.title : result.label;
    close();
  }

  function selectTopMatch(): void {
    const top =
      activeTab === 'toponyms'
        ? visibleToponyms[0]
        : activeTab === 'sheets'
          ? visibleSheets[0]
          : activeTab === 'images'
            ? imageMatches[0]
            : visibleToponyms[0] ?? visibleSheets[0] ?? imageMatches[0];
    if (top) select(top.item);
  }
</script>

<div class="search-menu">
  <div class="search-trigger-layer">
    <Button variant="prominent" active={expanded} class="search-trigger" aria-label={t().search.trigger} aria-expanded={expanded} onclick={toggle}>
      <svg class="search-icon search-trigger-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.8" cy="6.8" r="4.3"></circle>
        <path d="M10.2 10.2 14 14"></path>
      </svg>
      <span class="search-trigger-text">{t().search.trigger}</span>
    </Button>
  </div>

  {#if expanded}
    <div class="search-modal-layer">
      <Window
        class="search-window"
        variant="modal"
        placement="center"
        backdrop
        closeOnEscape
        onclose={close}
        style="--window-width: min(48rem, calc(100vw - (2 * var(--space-3)))); --window-height: min(54rem, calc(100dvh - (2 * var(--space-3))));"
      >
        {#snippet header()}
      <form class="search-form" onsubmit={(event) => { event.preventDefault(); selectTopMatch(); }}>
        <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.3"></circle>
          <path d="M10.2 10.2 14 14"></path>
        </svg>
        <input
          bind:this={inputElement}
          bind:value={query}
          type="text"
          placeholder={t().search.placeholder}
          aria-label={t().search.inputAria}
        />
      </form>
      <Button iconOnly aria-label={t().search.close} onclick={close}>×</Button>
        {/snippet}

    <div class="search-body">
      <div class="search-toolbar">
        <div class="search-tabs">
          <Button active={activeTab === 'all'} onclick={() => (activeTab = 'all')}>{t().search.tabAll}</Button>
          <Button active={activeTab === 'toponyms'} onclick={() => (activeTab = 'toponyms')}>{t().search.toponyms}</Button>
          <Button active={activeTab === 'sheets'} onclick={() => (activeTab = 'sheets')}>{t().search.sheets}</Button>
          <Button active={activeTab === 'images'} onclick={() => (activeTab = 'images')}>{t().images.trigger}</Button>
        </div>
        <div class="active-only-toggle" class:is-active={activeOnly}>
          <svg class="target-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5.6"></circle>
            <circle cx="8" cy="8" r="2.4"></circle>
          </svg>
          <span>{t().search.activeLayersOnly}</span>
          <Toggle checked={activeOnly} label="Limit results to active layers" onclick={() => (activeOnly = !activeOnly)} />
        </div>
      </div>

      {#if loading}
        <p class="search-status">{t().search.loadingIndex}</p>
      {:else if !trimmedQuery}
        <p class="search-status">{t().search.typeToSearch}</p>
      {:else if totalVisible === 0}
        <p class="search-status">{format(t().search.noResults, { query: trimmedQuery })}</p>
      {:else}
        <div class="search-results">
          {#if showToponyms && groupedToponyms.length > 0}
            {#if activeTab === 'all'}<h3 class="results-heading">{t().search.toponyms}</h3>{/if}
            {#each groupedToponyms as [layerLabel, matches] (layerLabel)}
              <section class="result-group" class:is-type-child={activeTab === 'all'}>
                <h4 class="result-group-heading">{layerLabel}</h4>
                <div class="result-items">
                  {#each matches as match (match.item.id)}
                    <Button variant="list" class="result-row" onclick={() => select(match.item)}>
                      <svg class="result-icon" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8 1.5c-2.6 0-4.6 2-4.6 4.5 0 3.3 4.6 8.5 4.6 8.5s4.6-5.2 4.6-8.5c0-2.5-2-4.5-4.6-4.5Z"></path>
                        <circle cx="8" cy="6" r="1.5"></circle>
                      </svg>
                      <span class="result-text">{match.item.text}</span>
                    </Button>
                  {/each}
                </div>
              </section>
            {/each}
          {/if}

          {#if showSheets && groupedSheets.length > 0}
            {#if activeTab === 'all'}<h3 class="results-heading">{t().search.sheets}</h3>{/if}
            {#each groupedSheets as [layerLabel, matches] (layerLabel)}
              <section class="result-group" class:is-type-child={activeTab === 'all'}>
                <h4 class="result-group-heading">{layerLabel}</h4>
                <div class="result-items">
                  {#each matches as match (match.item.id)}
                    <Button variant="list" class="result-row" onclick={() => select(match.item)}>
                      <svg class="result-icon" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M4 1.8h6l2.2 2.2v10.2H4Z"></path>
                        <path d="M10 1.8v2.2h2.2"></path>
                      </svg>
                      <span class="result-text">{match.item.label}</span>
                    </Button>
                  {/each}
                </div>
              </section>
            {/each}
          {/if}

          {#if showImages && groupedImages.length > 0}
            {#if activeTab === 'all'}<h3 class="results-heading">{t().images.trigger}</h3>{/if}
            {#each groupedImages as [collectionLabel, matches] (collectionLabel)}
              <section class="result-group" class:is-type-child={activeTab === 'all'}>
                <h4 class="result-group-heading">{collectionLabel}</h4>
                <div class="result-items">
                  {#each matches as match (match.item.id)}
                    <Button variant="list" class="result-row" onclick={() => select(match.item)}>
                      <svg class="result-icon" viewBox="0 0 16 16" aria-hidden="true">
                        <rect x="2" y="3" width="12" height="10" rx="1"></rect>
                        <circle cx="5.2" cy="6.2" r="1.2"></circle>
                        <path d="m3.5 11 3-3 2.2 2 1.5-1.4 2.3 2.4"></path>
                      </svg>
                      <span class="result-text-block">
                        <span class="result-text">{match.item.title}</span>
                        <span class="result-meta">{[match.item.year, match.item.location].filter(Boolean).join(' · ') || collectionLabel}</span>
                      </span>
                    </Button>
                  {/each}
                </div>
              </section>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
      </Window>
    </div>
  {/if}
</div>

<style>
  .search-menu,
  .search-trigger-layer {
    display: flex;
  }

  .search-menu {
    /* -- exposed -- */
    --search-trigger-icon-size: 1.5rem;
    /* -- end exposed -- */
  }

  .search-modal-layer {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Descendant selector (not inline style) so the portrait media query below can
     override these; the extra specificity beats the Button defaults outright. */
  .search-trigger-layer :global(.search-trigger) {
    --button-height: var(--app-primary-control-height);
    --button-padding-inline: var(--app-primary-control-padding-inline);
    --button-gap: var(--app-primary-control-gap);
    --button-font-size: var(--app-primary-control-font-size);
  }

  .search-trigger-text {
    max-width: 13rem;
    overflow: hidden;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Portrait windows are too narrow for labelled controls: collapse the trigger
     to a square icon-only button (the compare toggle in Canvas.svelte does the
     same). The descendant selector outranks the Button defaults outright. */
  @media (orientation: portrait) {
    .search-trigger-layer :global(.search-trigger) {
      --button-width: var(--app-primary-control-height);
      --button-padding-inline: 0rem;
    }

    .search-trigger-text {
      display: none;
    }

    .search-menu {
      --search-trigger-icon-size: 1.75rem;
    }
  }

  .search-icon {
    flex: 0 0 auto;
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .search-trigger-icon {
    width: var(--search-trigger-icon-size);
    height: var(--search-trigger-icon-size);
  }

  /* Fixed modal size is set via --window-width/--window-height on the Window's
     inline style: a :global(.search-window) rule ties with (or loses to)
     Window's own scoped rule and is unreliable. */
  :global(.search-window .window-body) {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .search-form {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    color: var(--color-text-muted);
  }

  .search-form input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--color-text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-base);
  }

  @media (max-width: 40rem) {
    .search-form input {
      /* iOS zooms focused inputs whose computed text size is below 16 CSS px.
         The root token accounts for the minimum fluid root scale. */
      font-size: max(var(--text-base), var(--text-mobile-input-min));
    }

    .search-body {
      padding: var(--space-2) var(--space-3) var(--space-3);
    }

    .search-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: var(--space-2);
    }

    .search-tabs {
      overflow-x: auto;
    }

    .active-only-toggle {
      justify-content: flex-end;
    }
  }

  .search-form input:focus {
    outline: none;
  }

  .search-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: var(--space-3) var(--space-4) var(--space-4);
    overflow: auto;
  }

  .search-toolbar {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex: 0 0 auto;
    margin-bottom: var(--space-3);
  }

  .search-tabs {
    display: flex;
    flex: 1 1 auto;
    gap: var(--space-1);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .search-tabs::-webkit-scrollbar {
    display: none;
  }

  .active-only-toggle {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-2);
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .active-only-toggle span {
    white-space: nowrap;
  }

  .active-only-toggle.is-active {
    color: var(--color-text-primary);
  }

  .target-icon {
    width: 0.875rem;
    height: 0.875rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .search-status {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  .search-results {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
    overflow: auto;
  }

  .results-heading {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .result-group.is-type-child {
    margin-inline-start: var(--space-4);
  }

  .result-items {
    margin-inline-start: var(--space-4);
  }

  .result-group-heading {
    margin: 0 0 var(--space-1);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-weight: 400;
  }

  .result-icon {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: var(--color-text-muted);
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .result-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-text-block {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--space-1);
  }

  .result-meta {
    overflow: hidden;
    color: var(--color-text-muted);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
