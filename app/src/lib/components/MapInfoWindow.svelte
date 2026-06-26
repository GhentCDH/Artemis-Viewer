<script lang="ts">
  import { fade } from 'svelte/transition';
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/artemis/ui/primitives/Button.svelte';
  import Window from '$lib/artemis/ui/primitives/Window.svelte';

  export let isOpen = false;
  export let collectionKey: string | null = null;
  export let collectionName: string = '';
  export let collectionColor: string = '';
  export let collectionDate: string = '';
  export let collectionInfo: string = '';
  export let sublayers: Array<{ id: string; subId: string; label: string; url?: string }> = [];
  export let pane: 'left' | 'right' = 'left';

  const dispatch = createEventDispatcher<{
    close: void;
    'sublayer-toggle': { sublayerId: string; enabled: boolean };
  }>();

  let sublayerState: Record<string, Record<string, boolean>> = {};
  let copiedSubId: string | null = null;
  let previousCollectionKey: string | null = null;
  let infoDropdownOpen = false;
  $: currentSublayerState = collectionKey
    ? (sublayerState[collectionKey] ?? defaultSublayerState())
    : {};

  $: if (collectionKey !== previousCollectionKey) {
    previousCollectionKey = collectionKey;
    if (collectionKey) {
      resetSublayersToDefaults(collectionKey);
    }
  }

  function defaultSublayerState() {
    return Object.fromEntries(
      sublayers.map((sub) => [sub.id, sub.id === 'iiif' || sub.id === 'wmts'])
    );
  }

  function resetSublayersToDefaults(key: string) {
    sublayerState = {
      ...sublayerState,
      [key]: defaultSublayerState(),
    };
  }

  function toggleSublayer(localId: string) {
    if (!collectionKey) return;
    const collectionState = sublayerState[collectionKey] ?? defaultSublayerState();
    const newState = !collectionState[localId];
    sublayerState = {
      ...sublayerState,
      [collectionKey]: {
        ...collectionState,
        [localId]: newState,
      },
    };
    const sub = sublayers.find(s => s.id === localId);
    if (sub) {
      dispatch('sublayer-toggle', { sublayerId: sub.subId, enabled: newState });
    }
  }

  function copyUrl(subId: string) {
    const sub = sublayers.find(s => s.id === subId);
    if (!sub?.url) return;
    navigator.clipboard.writeText(sub.url).then(() => {
      copiedSubId = subId;
      setTimeout(() => {
        copiedSubId = null;
      }, 1200);
    });
  }

  function close() {
    dispatch('close');
  }

</script>

{#if isOpen && collectionKey}
  <div transition:fade={{ duration: 180 }}>
    <Window
      class={`map-info-window ${pane === 'right' ? 'is-right' : ''}`}
      variant="floating"
      placement={pane}
      showClose={true}
      closeLabel={`Close ${collectionName} info`}
      on:close={close}
    >
      <div slot="header" class="header-left">
        <div class="collection-dot" style={`--c:${collectionColor}`}></div>
        <div class="header-text">
          <span class="collection-name">{collectionName}</span>
          <span class="collection-date">{collectionDate}</span>
        </div>
      </div>

      <!-- Sublayer rows -->
      <div class="sublayers-list">
        {#each sublayers as sub}
          <div class="sublayer-buttons">
            <Button
              class="sublayer-toggle"
              variant="chrome"
              active={currentSublayerState[sub.id] ?? false}
              aria-label={`Toggle ${sub.label} layer`}
              on:click={() => toggleSublayer(sub.id)}
            >
              {sub.label}
            </Button>
            <Button
              class="sublayer-copy"
              variant="chrome"
              active={copiedSubId === sub.id}
              title="Copy layer source"
              aria-label={`Copy ${sub.label} source`}
              on:click={() => copyUrl(sub.id)}
            >
              {#if copiedSubId === sub.id}
                ✓
              {:else}
                🔗
              {/if}
            </Button>
          </div>
        {/each}
      </div>

      <div class="info-dropdown-header">
        <span class="info-dropdown-label">about this map</span>
        <Button
          class="info-dropdown-toggle"
          variant="chrome"
          iconOnly={true}
          active={infoDropdownOpen}
          aria-label="Toggle collection info"
          on:click={() => (infoDropdownOpen = !infoDropdownOpen)}
        >
          <span class="dropdown-arrow">▼</span>
        </Button>
      </div>
      {#if infoDropdownOpen && collectionInfo}
        <div class="info-dropdown-content">
          {collectionInfo}
        </div>
      {/if}
    </Window>
  </div>
{/if}

<style>
  :global(.map-info-window) {
    position: fixed;
    top: 82px;
    left: 16px;
    z-index: 50;
    box-shadow: none;
    min-width: 240px;
    max-width: 280px;
    background: white;
    border-color: rgba(0, 0, 0, 0.1);
  }

  :global(.map-info-window.is-right) {
    left: calc(50vw + 16px);
  }

  @media (max-width: 900px) {
    :global(.map-info-window.is-right) {
      left: 16px;
      top: 268px;
    }
  }

  :global(.map-info-window .artemis-window-header) {
    padding: 12px 12px 0;
    border-bottom: 0;
    background: transparent;
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .collection-dot {
    flex: 0 0 10px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
    margin-top: 2px;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .collection-name {
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collection-date {
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.map-info-window .artemis-window-body) {
    padding: 8px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .info-dropdown-header {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .info-dropdown-label {
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--text-muted);
    text-transform: lowercase;
  }

  :global(.info-dropdown-toggle) {
    width: auto;
    height: auto;
    padding: 0;
    min-height: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
  }

  :global(.info-dropdown-toggle:hover:not(:disabled)) {
    background: transparent;
    color: var(--text-primary);
  }

  :global(.info-dropdown-toggle.is-active) {
    background: transparent;
    border: none;
    color: var(--text-primary);
  }

  .dropdown-arrow {
    font-size: 8px;
    transition: transform 150ms ease;
    display: inline-block;
    margin-left: 4px;
  }

  :global(.info-dropdown-toggle.is-active .dropdown-arrow) {
    transform: rotate(180deg);
  }

  .info-dropdown-content {
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.02);
    border-radius: var(--radius-xs);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-primary);
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .sublayers-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sublayer-buttons {
    display: flex;
    gap: 4px;
    align-items: stretch;
  }

  :global(.sublayer-toggle) {
    flex: 4;
  }

  :global(.sublayer-copy) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
