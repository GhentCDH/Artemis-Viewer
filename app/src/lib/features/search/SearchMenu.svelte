<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import Window from '$lib/shared/primitives/Window.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Toggle from '$lib/shared/primitives/Toggle.svelte';
  import { datasetUrl } from '$lib/core/dataset/dataSource';
  import { timelineSelection } from '$lib/features/timeline/timelineSelection.svelte';
  import { loadSearchIndex } from './searchIndex';
  import { searchByText } from './searchScoring';
  import { focusSearchResult } from './searchSelection';
  import type { ScoredResult, SearchIndex, SearchResult, SheetResult, ToponymResult } from './searchTypes';

  let {
    leftMap,
    rightMap,
  }: {
    leftMap: maplibregl.Map | null;
    rightMap: maplibregl.Map | null;
  } = $props();

  type Tab = 'all' | 'toponyms' | 'sheets';

  const PLACEHOLDERS = ['Search for a place…', 'Search for a map sheet…', 'Try "Ferraris"…'];
  const PLACEHOLDER_INTERVAL_MS = 2600;

  let expanded = $state(false);
  let query = $state('');
  let loading = $state(false);
  let activeTab = $state<Tab>('all');
  let activeOnly = $state(false);
  let index = $state<SearchIndex | null>(null);
  let placeholderIndex = $state(0);
  let inputElement = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    if (expanded) return;
    const interval = window.setInterval(() => {
      placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length;
    }, PLACEHOLDER_INTERVAL_MS);
    return () => window.clearInterval(interval);
  });

  const trimmedQuery = $derived(query.trim());
  const activeLayerIds = $derived(new Set(timelineSelection.activeLayerIds));

  const emptyToponymMatches: ScoredResult<ToponymResult>[] = [];
  const emptySheetMatches: ScoredResult<SheetResult>[] = [];

  const toponymMatches = $derived(
    index && trimmedQuery ? searchByText(index.toponyms, trimmedQuery, (item) => item.text) : emptyToponymMatches
  );
  const sheetMatches = $derived(
    index && trimmedQuery ? searchByText(index.sheets, trimmedQuery, (item) => item.label) : emptySheetMatches
  );

  const visibleToponyms = $derived(
    activeOnly ? toponymMatches.filter((match) => activeLayerIds.has(match.item.layerId)) : toponymMatches
  );
  const visibleSheets = $derived(
    activeOnly ? sheetMatches.filter((match) => activeLayerIds.has(match.item.layerId)) : sheetMatches
  );

  const showToponyms = $derived(activeTab === 'all' || activeTab === 'toponyms');
  const showSheets = $derived(activeTab === 'all' || activeTab === 'sheets');
  const groupedToponyms = $derived(showToponyms ? groupByLayer(visibleToponyms) : []);
  const groupedSheets = $derived(showSheets ? groupByLayer(visibleSheets) : []);
  const totalVisible = $derived(visibleToponyms.length + visibleSheets.length);

  function groupByLayer<T extends { item: { layerLabel: string } }>(matches: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const match of matches) {
      const list = groups.get(match.item.layerLabel);
      if (list) list.push(match);
      else groups.set(match.item.layerLabel, [match]);
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
    focusSearchResult(result, { leftMap, rightMap });
    query = result.kind === 'toponym' ? result.text : result.label;
    close();
  }

  function selectTopMatch(): void {
    const top = visibleToponyms[0] ?? visibleSheets[0];
    if (top) select(top.item);
  }
</script>

<div class="search-menu">
  <div class="search-trigger-layer">
    <Button class="search-trigger" aria-label="Search" aria-expanded={expanded} onclick={toggle}>
      <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.8" cy="6.8" r="4.3"></circle>
        <path d="M10.2 10.2 14 14"></path>
      </svg>
      <span class="search-trigger-text">{PLACEHOLDERS[placeholderIndex]}</span>
    </Button>
  </div>

  {#if expanded}
    <div class="search-modal-layer">
      <Window class="search-window" variant="modal" placement="center" backdrop closeOnEscape onclose={close}>
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
          placeholder={PLACEHOLDERS[0]}
          aria-label="Search toponyms and map sheets"
        />
      </form>
      <Button iconOnly aria-label="Close search" onclick={close}>×</Button>
        {/snippet}

    <div class="search-body">
      <div class="search-toolbar">
        <div class="search-tabs">
          <Button active={activeTab === 'all'} onclick={() => (activeTab = 'all')}>All</Button>
          <Button active={activeTab === 'toponyms'} onclick={() => (activeTab = 'toponyms')}>Toponyms</Button>
          <Button active={activeTab === 'sheets'} onclick={() => (activeTab = 'sheets')}>Sheets</Button>
        </div>
        <div class="active-only-toggle" class:is-active={activeOnly}>
          <svg class="target-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5.6"></circle>
            <circle cx="8" cy="8" r="2.4"></circle>
          </svg>
          <span>Active layers only</span>
          <Toggle checked={activeOnly} label="Limit results to active layers" onclick={() => (activeOnly = !activeOnly)} />
        </div>
      </div>

      {#if loading}
        <p class="search-status">Loading search index…</p>
      {:else if !trimmedQuery}
        <p class="search-status">Type to search historical place names and map sheets.</p>
      {:else if totalVisible === 0}
        <p class="search-status">No results for “{trimmedQuery}”.</p>
      {:else}
        <div class="search-results">
          {#if showToponyms && groupedToponyms.length > 0}
            {#if activeTab === 'all'}<h3 class="results-heading">Toponyms</h3>{/if}
            {#each groupedToponyms as [layerLabel, matches] (layerLabel)}
              <section class="result-group">
                <h4 class="result-group-heading">{layerLabel}</h4>
                {#each matches as match (match.item.id)}
                  <button type="button" class="result-row" onclick={() => select(match.item)}>
                    <svg class="result-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 1.5c-2.6 0-4.6 2-4.6 4.5 0 3.3 4.6 8.5 4.6 8.5s4.6-5.2 4.6-8.5c0-2.5-2-4.5-4.6-4.5Z"></path>
                      <circle cx="8" cy="6" r="1.5"></circle>
                    </svg>
                    <span class="result-text">{match.item.text}</span>
                  </button>
                {/each}
              </section>
            {/each}
          {/if}

          {#if showSheets && groupedSheets.length > 0}
            {#if activeTab === 'all'}<h3 class="results-heading">Sheets</h3>{/if}
            {#each groupedSheets as [layerLabel, matches] (layerLabel)}
              <section class="result-group">
                <h4 class="result-group-heading">{layerLabel}</h4>
                {#each matches as match (match.item.id)}
                  <button type="button" class="result-row" onclick={() => select(match.item)}>
                    <svg class="result-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 1.8h6l2.2 2.2v10.2H4Z"></path>
                      <path d="M10 1.8v2.2h2.2"></path>
                    </svg>
                    <span class="result-text">{match.item.label}</span>
                  </button>
                {/each}
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

  .search-modal-layer {
    position: fixed;
    inset: 0;
    z-index: var(--z-popover);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.search-trigger) {
    --button-height: 2.25rem;
    --button-padding-inline: var(--space-4);
  }

  .search-trigger-text {
    max-width: 13rem;
    overflow: hidden;
    color: var(--color-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-icon {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.search-window) {
    width: min(44rem, 92vw);
    height: min(54rem, 82vh);
  }

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
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex: 0 0 auto;
    margin-bottom: var(--space-3);
  }

  .search-tabs {
    display: flex;
    gap: var(--space-1);
  }

  .active-only-toggle {
    display: flex;
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

  .result-group-heading {
    margin: 0 0 var(--space-1);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-weight: 400;
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    border: 0;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    background: transparent;
    color: var(--color-text-primary);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }

  .result-row:hover {
    background: var(--color-surface-control-hover);
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
</style>
