<script lang="ts">
  import { browser } from '$app/environment';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import Button from '$lib/shared/primitives/Button.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import Toggle from '$lib/shared/primitives/Toggle.svelte';

  interface Props {
    layer: LayerSummary | null;
    sublayerState?: Record<string, boolean>;
    onclose?: () => void;
    ontoggle?: (sublayerId: string) => void;
  }

  let {
    layer = null,
    sublayerState = {},
    onclose,
    ontoggle,
  }: Props = $props();

  let copiedSublayerId = $state<string | null>(null);
  let openInfoSublayerId = $state<string | null>(null);
  /* 6rem in px; the root font-size is fluid, so read it instead of assuming 16px */
  const detailCloseDistance =
    6 * (browser ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 16);
  const dateLabel = $derived(layer ? `${layer.startYear}-${layer.endYear}` : '');
  const openInfoSublayer = $derived(layer?.sublayers.find((sublayer) => sublayer.id === openInfoSublayerId) ?? null);

  $effect(() => {
    if (openInfoSublayerId !== null && layer?.sublayers.some((sublayer) => sublayer.id === openInfoSublayerId) !== true) {
      openInfoSublayerId = null;
    }
  });

  function formatKind(kind: string): string {
    return kind.trim().toUpperCase();
  }

  function copyDownloadUrl(sublayerId: string, downloadUrl: string): void {
    if (!downloadUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(downloadUrl).then(() => {
      copiedSublayerId = sublayerId;
      window.setTimeout(() => {
        if (copiedSublayerId === sublayerId) {
          copiedSublayerId = null;
        }
      }, 1200);
    });
  }

  function toggleInfo(sublayerId: string): void {
    openInfoSublayerId = openInfoSublayerId === sublayerId ? null : sublayerId;
  }
</script>

{#if layer && layer.sublayers.length > 0}
  <div class="sublayer-menu-stack">
    <Window
      class="sublayer-menu-window"
      variant="popover"
      placement="anchored"
    >
      {#snippet header()}
        <div class="sublayer-header">
          <span class="collection-dot" aria-hidden="true"></span>
          <div class="collection-heading">
            <h2>{layer.label}</h2>
            <p>{dateLabel}</p>
          </div>
        </div>
        <Button
          iconOnly
          aria-label={`Close ${layer.label} sublayer menu`}
          onclick={() => onclose?.()}
          style="--button-bg: transparent; --button-bg-hover: transparent; --button-border: transparent; --button-border-hover: transparent; --button-text: var(--color-text-muted); --button-height: 2rem;"
        >
          <span class="close-glyph" aria-hidden="true">×</span>
        </Button>
      {/snippet}

      <div class="sublayer-menu" aria-label={`${layer.label} sublayers`}>
        <WaveSeparator />
        {#each layer.sublayers as sublayer (sublayer.id)}
          {@const enabled = sublayerState[sublayer.id] ?? false}
          {@const infoOpen = openInfoSublayerId === sublayer.id}
          <div class="sublayer-row">
            <div class="sublayer-copy">
              <span class="sublayer-name">{sublayer.name}</span>
            </div>
            <Toggle
              checked={enabled}
              label={`${enabled ? 'Hide' : 'Show'} ${sublayer.name}`}
              onclick={() => ontoggle?.(sublayer.id)}
            />
            <Button
              class="info-button"
              iconOnly
              aria-expanded={infoOpen}
              aria-label={`${infoOpen ? 'Hide' : 'Show'} ${sublayer.name} info`}
              onclick={() => toggleInfo(sublayer.id)}
              style="--button-bg: transparent; --button-bg-hover: transparent; --button-border: transparent; --button-border-hover: transparent; --button-text: var(--color-text-muted); --button-height: 1.75rem;"
            >
              <svg class="info-icon" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6"></circle>
                <path d="M8 7.2v3.8"></path>
                <path d="M8 4.9h.01"></path>
              </svg>
            </Button>
          </div>
        {/each}
      </div>
    </Window>

    {#if openInfoSublayer}
      <Window
        class="sublayer-detail-window"
        variant="popover"
        placement="anchored"
        title={openInfoSublayer.name}
        subtitle={formatKind(openInfoSublayer.kind)}
        closeOnPointerDistance={detailCloseDistance}
        onclose={() => {
          openInfoSublayerId = null;
        }}
      >
        <div class="sublayer-detail">
          <WaveSeparator />
          {#if openInfoSublayer.description}
            {#each openInfoSublayer.description.split(/\n\s*\n/).filter(Boolean) as paragraph}
              <p>{paragraph}</p>
            {/each}
          {/if}
          {#if openInfoSublayer.citation}
            <section class="detail-section" aria-label={`${openInfoSublayer.name} citation`}>
              <WaveSeparator />
              <h3>Citation</h3>
              <p>{openInfoSublayer.citation}</p>
            </section>
          {/if}
          {#if openInfoSublayer.readingList.length > 0}
            <section class="detail-section" aria-label={`${openInfoSublayer.name} reading list`}>
              <WaveSeparator />
              <h3>Reading list</h3>
              <ul class="reading-list">
                {#each openInfoSublayer.readingList as entry (entry.label)}
                  <li><a href={entry.url} target="_blank" rel="noreferrer">{entry.label}</a></li>
                {/each}
              </ul>
            </section>
          {/if}
          {#if openInfoSublayer.downloadUrl}
            <section class="detail-section" aria-label={`${openInfoSublayer.name} download`}>
              <WaveSeparator />
              <h3>Download</h3>
              <div class="download-row">
                <a href={openInfoSublayer.downloadUrl} target="_blank" rel="noreferrer">
                  {openInfoSublayer.downloadFile || 'Download'}
                </a>
                <Button
                  class="download-copy-button"
                  iconOnly
                  aria-label={`Copy ${openInfoSublayer.name} download link`}
                  onclick={() => copyDownloadUrl(openInfoSublayer.id, openInfoSublayer.downloadUrl)}
                  style="--button-bg: transparent; --button-bg-hover: transparent; --button-border: transparent; --button-border-hover: transparent; --button-text: var(--color-accent); --button-height: 1.5rem;"
                >
                  <svg class="copy-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="5" y="5" width="8" height="8" rx="1.2"></rect>
                    <path d="M3 10.5V3.8C3 3.4 3.4 3 3.8 3h6.7"></path>
                  </svg>
                </Button>
                {#if copiedSublayerId === openInfoSublayer.id}
                  <span class="copy-status">Copied</span>
                {/if}
              </div>
            </section>
          {/if}
        </div>
      </Window>
    {/if}
  </div>
{/if}

<style>
  .sublayer-menu-stack {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    user-select: none;
  }

  :global(.sublayer-menu-window) {
    --window-radius: var(--radius-lg);

    flex: 0 1 min(19.8rem, calc(100vw - (2 * var(--space-3))));
    max-width: 100%;
    max-height: min(19.8rem, calc(100dvh - (2 * var(--space-3))));
  }

  :global(.sublayer-detail-window) {
    --window-radius: var(--radius-lg);

    flex: 0 0 min(19.8rem, max(15.4rem, calc(100vw - 24.8rem)));
    max-height: 19.8rem;
  }

  :global(.sublayer-menu-window .window-header) {
    align-items: flex-start;
    padding: var(--space-4) var(--space-4) var(--space-2);
    border-bottom: 0;
  }

  :global(.sublayer-detail-window .window-header) {
    border-bottom: 0;
  }

  :global(.sublayer-menu-window .window-body),
  :global(.sublayer-detail-window .window-body) {
    overflow: auto;
  }

  .sublayer-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
  }

  .collection-dot {
    flex: 0 0 0.75rem;
    width: 0.75rem;
    height: 0.75rem;
    margin-top: var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--color-timeline-axis);
  }

  .collection-heading {
    min-width: 0;
  }

  .collection-heading h2 {
    margin: 0;
    color: var(--color-text-primary);
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.15;
  }

  .collection-heading p {
    margin: var(--space-2) 0 0;
    color: var(--color-accent);
    font-size: var(--text-sm);
    line-height: 1.1;
  }

  .close-glyph {
    font-size: var(--text-lg);
    line-height: 1;
  }

  .sublayer-menu {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--space-3) var(--space-4) var(--space-3);
  }

  .sublayer-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2rem;
  }

  .sublayer-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .sublayer-name {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1.25;
  }

  :global(.sublayer-menu-window .toggle) {
    --toggle-width: 1.5rem;
    --toggle-height: 0.875rem;
    --toggle-padding: 0.09375rem;
    --toggle-track-bg-checked: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface-control-hover));
    --toggle-thumb-bg-checked: var(--color-accent);
  }

  :global(.info-button) {
    flex: 0 0 auto;
    --button-height: 1.5rem;
  }

  .info-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .sublayer-detail {
    position: relative;
    padding: var(--space-3);
  }

  .sublayer-detail p {
    margin: 0;
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    line-height: 1.6;
    user-select: text;
  }

  .sublayer-detail p + p {
    margin-top: var(--space-3);
  }

  .detail-section {
    position: relative;
    margin-top: var(--space-4);
    padding-top: var(--space-3);
  }

  .detail-section h3 {
    margin: 0 0 var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .reading-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding-left: var(--space-4);
  }

  .reading-list li {
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .reading-list a {
    color: var(--color-accent);
    overflow-wrap: anywhere;
    user-select: text;
  }

  .download-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  @media (max-width: 40rem) {
    .sublayer-menu-stack {
      width: 100%;
      flex-direction: column;
      gap: var(--space-2);
    }

    :global(.sublayer-menu-window),
    :global(.sublayer-detail-window) {
      width: 100%;
      max-height: min(16rem, calc(50dvh - (2 * var(--space-3))));
      flex-basis: auto;
    }

    :global(.sublayer-menu-window .window-header) {
      padding: var(--space-3) var(--space-3) var(--space-2);
    }

    .sublayer-menu {
      padding: var(--space-2) var(--space-3);
    }
  }

  .download-row a {
    min-width: 0;
    color: var(--color-accent);
    font-size: var(--text-xs);
    line-height: 1.3;
    overflow-wrap: anywhere;
    user-select: text;
  }

  .copy-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .copy-status {
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    line-height: 1.2;
  }

  @media (max-width: 56rem) {
    .sublayer-menu-stack {
      flex-direction: column;
      width: min(19.8rem, calc(100vw - var(--space-8)));
    }

    :global(.sublayer-menu-window),
    :global(.sublayer-detail-window) {
      flex-basis: auto;
      width: 100%;
    }
  }

  @media (orientation: portrait) {
    :global(.sublayer-menu-window) {
      max-height: min(14rem, calc(50dvh - (2 * var(--space-3))));
    }

    :global(.sublayer-menu-window .window-header) {
      padding: var(--space-2) var(--space-3) var(--space-1);
    }

    .collection-heading p {
      display: none;
    }

    .sublayer-menu {
      padding: var(--space-1) var(--space-3) var(--space-2);
    }

    .sublayer-row {
      min-height: 1.75rem;
    }

    :global(.sublayer-menu-window .toggle) {
      --toggle-width: 2.25rem;
      --toggle-height: 1.25rem;
      --toggle-padding: 0.125rem;
    }
  }
</style>
