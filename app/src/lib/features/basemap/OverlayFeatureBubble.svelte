<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import type { OverlayFeatureInfo } from '$lib/core/map/basemap';
  import PreviewBubble from '$lib/shared/primitives/PreviewBubble.svelte';
  import { t } from '$lib/shared/i18n/i18n.svelte';

  let {
    map,
    lngLat,
    info,
    onclose,
  }: {
    map: maplibregl.Map;
    lngLat: [number, number];
    info: OverlayFeatureInfo;
    onclose: () => void;
  } = $props();

  const entries = $derived(Object.entries(info.properties).filter(([, value]) => value !== null && value !== ''));

  function formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
</script>

<PreviewBubble
  {map}
  {lngLat}
  {onclose}
  interactive
  title={info.title}
  showClose
  closeLabel={t().basemap.closeFeatureInfo}
  windowStyle="--window-width: min(24rem, calc(100dvw - 2 * var(--space-3))); --window-max-height: min(28rem, calc(100dvh - 2 * var(--space-3)));"
>
  {#if entries.length === 0}
    <p class="feature-empty">{t().basemap.noFeatureAttributes}</p>
  {:else}
    <dl class="feature-properties">
      {#each entries as [name, value] (name)}
        <div class="feature-property">
          <dt>{name}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</PreviewBubble>

<style>
  .feature-properties {
    max-height: 20rem;
    margin: 0;
    overflow: auto;
  }

  .feature-property {
    display: grid;
    grid-template-columns: minmax(6rem, 0.4fr) minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
  }

  .feature-property:first-child {
    border-top: 0;
  }

  .feature-property dt {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .feature-property dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    white-space: pre-wrap;
  }

  .feature-empty {
    margin: 0;
    padding: var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }
</style>
