<script lang="ts">
  import type { LocalizedText } from '$lib/shared/i18n/i18n.svelte';
  import { format, localize, paragraphs, t } from '$lib/shared/i18n/i18n.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import type { MetadataLink, MetadataSource } from './types';

  interface Props {
    title: LocalizedText;
    subtitle?: string;
    description?: LocalizedText | null;
    furtherReading?: MetadataLink[];
    sources?: MetadataSource[];
    class?: string;
    style?: string;
    showClose?: boolean;
    closeOnPointerDistance?: number;
    onclose?: () => void;
  }

  let {
    title,
    subtitle = '',
    description = null,
    furtherReading = [],
    sources = [],
    class: className = '',
    style = '',
    showClose = false,
    closeOnPointerDistance,
    onclose,
  }: Props = $props();

  let copiedSourceUrl = $state<string | null>(null);
  const localizedTitle = $derived(localize(title));

  function copySourceUrl(sourceUrl: string): void {
    if (!sourceUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(sourceUrl).then(() => {
      copiedSourceUrl = sourceUrl;
      window.setTimeout(() => {
        if (copiedSourceUrl === sourceUrl) copiedSourceUrl = null;
      }, 1200);
    });
  }

  function sourceLinkLabel(url: string): string {
    const match = decodeURIComponent(url).match(/\/([^/?#]+?)(?:\/content)?(?:[?#]|$)/);
    return match?.[1] || t().metadataInfo.openSource;
  }
</script>

<Window
  class={className}
  variant="popover"
  placement="anchored"
  title={localizedTitle}
  {subtitle}
  {showClose}
  {closeOnPointerDistance}
  {onclose}
  {style}
>
  <div class="metadata-info">
    <WaveSeparator />
    {#each paragraphs(localize(description)) as paragraph}
      <p>{paragraph}</p>
    {/each}
    {#if furtherReading.length > 0}
      <section class="metadata-section" aria-label={format(t().metadataInfo.readingListAria, { name: localizedTitle })}>
        <WaveSeparator />
        <h3>{t().metadataInfo.readingList}</h3>
        <ul class="metadata-list">
          {#each furtherReading as entry (entry.label)}
            <li><a href={entry.url} target="_blank" rel="noreferrer">{entry.label}</a></li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if sources.length > 0}
      <section class="metadata-section" aria-label={format(t().metadataInfo.sourcesAria, { name: localizedTitle })}>
        <WaveSeparator />
        <h3>{t().metadataInfo.sources}</h3>
        <ul class="metadata-list source-list">
          {#each sources as source, index (`${source.url}-${index}`)}
            <li>
              <p>{source.citation}</p>
              <div class="source-link-row">
                <a href={source.url} target="_blank" rel="noreferrer">{sourceLinkLabel(source.url)}</a>
                <Button
                  iconOnly
                  aria-label={format(t().metadataInfo.copySourceLink, { name: localizedTitle })}
                  onclick={() => copySourceUrl(source.url)}
                  variant="quiet"
                  style="--button-text: var(--color-accent); --button-height: 1.5rem;"
                >
                  <svg class="copy-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="5" y="5" width="8" height="8" rx="1.2"></rect>
                    <path d="M3 10.5V3.8C3 3.4 3.4 3 3.8 3h6.7"></path>
                  </svg>
                </Button>
                {#if copiedSourceUrl === source.url}<span class="copy-status">{t().metadataInfo.copied}</span>{/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</Window>

<style>
  .metadata-info {
    position: relative;
    padding: var(--space-3);
  }

  .metadata-info p {
    margin: 0;
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    line-height: 1.6;
    user-select: text;
  }

  .metadata-info p + p {
    margin-top: var(--space-3);
  }

  .metadata-info a {
    color: var(--color-accent);
    overflow-wrap: anywhere;
    user-select: text;
  }

  .metadata-section {
    position: relative;
    margin-top: var(--space-4);
    padding-top: var(--space-3);
  }

  .metadata-section h3 {
    margin: 0 0 var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .metadata-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding-left: var(--space-4);
  }

  .metadata-list li {
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .source-link-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .source-link-row a {
    min-width: 0;
    font-size: var(--text-xs);
    line-height: 1.3;
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
</style>
