<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/shared/i18n/i18n.svelte';
  import type OpenSeadragonType from 'openseadragon';
  import Button from '$lib/shared/primitives/Button.svelte';
  import { hideTooltip, showTooltip } from '$lib/shared/tooltip.svelte';
  import { loadIiifViewerSource, type IiifMetadataField } from './manifest';

  let {
    manifestUrl,
    imageId = '',
    forceExpanded = false,
    onclose,
    onExpandedChange,
    onCanvasHost,
    onTitleChange,
  }: {
    manifestUrl: string;
    imageId?: string;
    forceExpanded?: boolean;
    onclose: () => void;
    onExpandedChange?: (expanded: boolean) => void;
    /** Reports the element hosting the OpenSeadragon canvases (null on teardown) — the screenshot feature composites them from there. */
    onCanvasHost?: (host: HTMLElement | null) => void;
    onTitleChange?: (title: string) => void;
  } = $props();
  let container: HTMLElement;
  let title = $state('Historical document');
  let error = $state('');
  let expanded = $state(false);
  let metadataOpen = $state(false);
  let metadata = $state<IiifMetadataField[]>([]);
  let copyStatus = $state<'idle' | 'copied' | 'failed'>('idle');
  let copyStatusTimer: ReturnType<typeof setTimeout> | undefined;

  function toggleExpanded(): void {
    expanded = !expanded;
    onExpandedChange?.(expanded);
  }

  async function copyManifestUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(manifestUrl);
      copyStatus = 'copied';
    } catch {
      copyStatus = 'failed';
    }
    clearTimeout(copyStatusTimer);
    copyStatusTimer = setTimeout(() => (copyStatus = 'idle'), 2000);
  }

  function openInAllmapsViewer(): void {
    const url = `https://viewer.allmaps.org/?url=${encodeURIComponent(manifestUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function showHeaderTooltip(text: string, event: MouseEvent | FocusEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showTooltip({ text, x: rect.left + rect.width / 2, y: rect.bottom, placement: 'below' });
  }

  onMount(() => {
    let cancelled = false;
    let viewer: OpenSeadragonType.Viewer | undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (expanded) {
        expanded = false;
        onExpandedChange?.(false);
      } else {
        onclose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    onCanvasHost?.(container);

    void (async () => {
      try {
        const source = await loadIiifViewerSource(manifestUrl, imageId);
        if (cancelled) return;
        title = source.title;
        onTitleChange?.(source.title);
        metadata = source.metadata;
        const OpenSeadragon = (await import('openseadragon')).default;
        if (cancelled) return;
        viewer = OpenSeadragon({
          element: container,
          tileSources: `${source.imageServiceUrl}/info.json`,
          showNavigationControl: false,
          showZoomControl: false,
          showHomeControl: false,
          showFullPageControl: false,
          showSequenceControl: false,
          animationTime: 0.3,
          visibilityRatio: 0.5,
          gestureSettingsMouse: { scrollToZoom: true },
          crossOriginPolicy: 'Anonymous',
        });
      } catch (cause) {
        if (!cancelled) error = cause instanceof Error ? cause.message : t().iiifViewer.openFailed;
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(copyStatusTimer);
      onCanvasHost?.(null);
      onExpandedChange?.(false);
      viewer?.destroy();
    };
  });
</script>

<section class="iiif-viewer" class:iiif-viewer--expanded={expanded || forceExpanded} aria-label={t().iiifViewer.viewerAria}>
  <header class="iiif-viewer__header">
    <div class="iiif-viewer__header-left">
      {#if !forceExpanded}
        <Button
          iconOnly
          active={expanded}
          aria-label={expanded ? t().iiifViewer.exitFullscreen : t().iiifViewer.fullscreen}
          onmouseenter={(event) => showHeaderTooltip(expanded ? t().iiifViewer.exitFullscreen : t().iiifViewer.fullscreen, event)}
          onmouseleave={hideTooltip}
          onfocus={(event) => showHeaderTooltip(expanded ? t().iiifViewer.exitFullscreen : t().iiifViewer.fullscreen, event)}
          onblur={hideTooltip}
          onclick={toggleExpanded}
        >
          {#if expanded}
            <svg class="iiif-viewer__header-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"></path>
            </svg>
          {:else}
            <svg class="iiif-viewer__header-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"></path>
            </svg>
          {/if}
        </Button>
      {/if}
    </div>
    <div class="iiif-viewer__title" title={title}>{title}</div>
    <div class="iiif-viewer__header-right">
      <Button
        iconOnly
        aria-label={copyStatus === 'copied' ? t().iiifViewer.manifestCopied : copyStatus === 'failed' ? t().iiifViewer.manifestCopyFailed : t().iiifViewer.copyManifest}
        onmouseenter={(event) => showHeaderTooltip(copyStatus === 'copied' ? t().iiifViewer.copied : copyStatus === 'failed' ? t().iiifViewer.copyFailed : t().iiifViewer.copyManifest, event)}
        onmouseleave={hideTooltip}
        onfocus={(event) => showHeaderTooltip(t().iiifViewer.copyManifest, event)}
        onblur={hideTooltip}
        onclick={copyManifestUrl}
      >
        {#if copyStatus === 'copied'}
          <svg class="iiif-viewer__header-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 4 4L19 6"></path>
          </svg>
        {:else}
          <svg class="iiif-viewer__header-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="1"></rect>
            <path d="M16 8V5H5v11h3"></path>
          </svg>
        {/if}
      </Button>
      <Button
        iconOnly
        aria-label={t().iiifViewer.openInAllmaps}
        onmouseenter={(event) => showHeaderTooltip(t().iiifViewer.openInAllmaps, event)}
        onmouseleave={hideTooltip}
        onfocus={(event) => showHeaderTooltip(t().iiifViewer.openInAllmaps, event)}
        onblur={hideTooltip}
        onclick={openInAllmapsViewer}
      >
        <svg class="iiif-viewer__header-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 5h5v5M19 5l-8 8"></path>
          <path d="M18 13v6H5V6h6"></path>
        </svg>
      </Button>
      <Button active={metadataOpen} aria-expanded={metadataOpen} aria-controls="iiif-viewer-metadata" onclick={() => (metadataOpen = !metadataOpen)}>
        {t().iiifViewer.metadata}
      </Button>
      <Button iconOnly aria-label={t().iiifViewer.closeViewer} onclick={onclose}>×</Button>
    </div>
  </header>
  <div class="iiif-viewer__main">
    <div class="iiif-viewer__body" bind:this={container}>
      {#if error}<p class="iiif-viewer__error" role="alert">{error}</p>{/if}
    </div>
    {#if metadataOpen}
      <aside id="iiif-viewer-metadata" class="iiif-viewer__metadata" aria-label={t().iiifViewer.metadataAria}>
        <h2>{t().iiifViewer.metadata}</h2>
        {#if metadata.length > 0}
          <dl>
            {#each metadata as field}
              <div class="iiif-viewer__metadata-field">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            {/each}
          </dl>
        {:else if !error}
          <p>{t().iiifViewer.loadingMetadata}</p>
        {/if}
      </aside>
    {/if}
  </div>
</section>

<style>
  .iiif-viewer {
    /* -- exposed -- */
    --iiif-viewer-min-width: 0rem;
    --iiif-viewer-header-height: 3rem;
    --iiif-viewer-metadata-width: 20rem;
    /* -- end exposed -- */

    display: flex;
    flex: 1 1 0;
    min-width: var(--iiif-viewer-min-width);
    height: 100%;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--color-border);
    background: var(--color-surface-raised);
  }

  .iiif-viewer__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    min-height: var(--iiif-viewer-header-height);
    padding: var(--space-2) var(--space-3);
    gap: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .iiif-viewer__header-left,
  .iiif-viewer__header-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .iiif-viewer__header-right {
    justify-content: flex-end;
  }

  .iiif-viewer__header-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .iiif-viewer--expanded {
    position: fixed;
    inset: 0;
    z-index: var(--z-flash);
    width: 100vw;
    height: 100vh;
    border-left: 0;
  }

  .iiif-viewer__title {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-primary);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .iiif-viewer__main {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .iiif-viewer__body {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--color-map-background);
  }

  .iiif-viewer__metadata {
    width: var(--iiif-viewer-metadata-width);
    max-width: 50%;
    overflow: auto;
    padding: var(--space-4);
    border-left: 1px solid var(--color-border);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    font-family: var(--font-readable);
  }

  .iiif-viewer__metadata h2 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-md);
  }

  .iiif-viewer__metadata dl,
  .iiif-viewer__metadata p {
    margin: 0;
  }

  .iiif-viewer__metadata-field + .iiif-viewer__metadata-field {
    margin-top: var(--space-4);
  }

  .iiif-viewer__metadata dt {
    color: var(--color-text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .iiif-viewer__metadata dd {
    margin: var(--space-1) 0 0;
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
    line-height: 1.45;
    white-space: pre-line;
  }

  .iiif-viewer__error {
    position: absolute;
    inset: var(--space-4);
    margin: 0;
    color: var(--color-text-error);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
  }
</style>
