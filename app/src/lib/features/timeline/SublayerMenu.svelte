<script lang="ts">
  import { browser } from '$app/environment';
  import { format, localize, t } from '$lib/shared/i18n/i18n.svelte';
  import type { LayerSummary } from '$lib/core/dataset/layerRegistry';
  import MetadataInfoWindow from '$lib/shared/metadata/MetadataInfoWindow.svelte';
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
          aria-label={format(t().sublayers.closeMenu, { layer: layer.label })}
          onclick={() => onclose?.()}
          style="--button-bg: transparent; --button-bg-hover: transparent; --button-border: transparent; --button-border-hover: transparent; --button-text: var(--color-text-muted); --button-height: 2rem;"
        >
          <span class="close-glyph" aria-hidden="true">×</span>
        </Button>
      {/snippet}

      <div class="sublayer-menu" aria-label={format(t().sublayers.menuAria, { layer: layer.label })}>
        <WaveSeparator />
        {#each layer.sublayers as sublayer (sublayer.id)}
          {@const enabled = sublayerState[sublayer.id] ?? false}
          {@const infoOpen = openInfoSublayerId === sublayer.id}
          <div class="sublayer-row">
            <div class="sublayer-copy">
              <span class="sublayer-name">{localize(sublayer.name)}</span>
            </div>
            <Toggle
              checked={enabled}
              label={format(enabled ? t().sublayers.hide : t().sublayers.show, { name: localize(sublayer.name) })}
              onclick={() => ontoggle?.(sublayer.id)}
            />
            <Button
              class="info-button"
              iconOnly
              aria-expanded={infoOpen}
              aria-label={format(infoOpen ? t().sublayers.hideInfo : t().sublayers.showInfo, { name: localize(sublayer.name) })}
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
      <MetadataInfoWindow
        class="sublayer-detail-window"
        title={openInfoSublayer.name}
        subtitle={formatKind(openInfoSublayer.kind)}
        description={openInfoSublayer.description}
        furtherReading={openInfoSublayer.furtherReading}
        sources={openInfoSublayer.sources}
        closeOnPointerDistance={detailCloseDistance}
        onclose={() => {
          openInfoSublayerId = null;
        }}
      />
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

    flex: 0 1 auto;
    width: fit-content;
    /* Must stay wider than the scaled branding trigger it overlays in the
       top-left slot, so the trigger never peeks out from underneath. */
    min-width: 15.5rem;
    max-width: min(19.8rem, calc(100vw - (2 * var(--space-3))));
    max-height: min(19.8rem, calc(100dvh - (2 * var(--space-3))));
  }

  :global(.sublayer-detail-window) {
    --window-radius: var(--radius-lg);

    flex: 0 0 min(21.8rem, max(15.4rem, calc(100vw - 24.8rem)));
    max-height: 19.8rem;
  }

  :global(.sublayer-menu-window .window-header) {
    align-items: flex-start;
    padding: var(--space-3) var(--space-3) var(--space-2);
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
    display: grid;
    grid-template-columns: minmax(0, max-content) max-content 1fr;
    column-gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  .sublayer-row {
    position: relative;
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    min-height: 1.75rem;
  }

  .sublayer-copy {
    min-width: 0;
  }

  .sublayer-name {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1.25;
  }

  :global(.sublayer-menu-window .toggle) {
    --toggle-width: 2.25rem;
    --toggle-height: 1.25rem;
    --toggle-track-bg-checked: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface-control-hover));
    --toggle-thumb-bg-checked: var(--color-accent);
  }

  :global(.info-button) {
    flex: 0 0 auto;
    margin-left: auto;
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

    .sublayer-menu {
      padding: var(--space-2) var(--space-3);
    }
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
  }
</style>
