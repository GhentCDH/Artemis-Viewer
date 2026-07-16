<script lang="ts">
  import {
    ARTEMIS_BASEMAP,
    BUILT_IN_BASEMAPS,
    type BasemapOption,
    type OverlayOption,
  } from '$lib/core/map/basemap';
  import Button from '$lib/shared/primitives/Button.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import { hideTooltip, showTooltip } from '$lib/shared/tooltip.svelte';
  import { format, t } from '$lib/shared/i18n/i18n.svelte';
  import {
    loadCustomBasemaps,
    loadCustomOverlays,
    discoverOverlayQueryCapability,
    resolveCustomBasemap,
    saveCustomBasemaps,
    saveCustomOverlays,
    validateTileImage,
    validateWfsGeoJson,
  } from './customBasemap';

  let {
    selected,
    registeredBasemaps,
    onselect,
    selectedOverlay,
    registeredOverlays,
    onOverlaySelect,
    overlayOpacity,
    onOverlayOpacityChange,
  }: {
    selected: BasemapOption;
    registeredBasemaps: BasemapOption[];
    onselect: (basemap: BasemapOption) => void;
    selectedOverlay: OverlayOption | null;
    registeredOverlays: OverlayOption[];
    onOverlaySelect: (overlay: OverlayOption | null) => void;
    overlayOpacity: number;
    onOverlayOpacityChange: (opacity: number) => void;
  } = $props();

  let open = $state(false);
  let activeSection = $state<'background' | 'overlay'>('background');
  let adding = $state<'basemap' | 'overlay' | null>(null);
  let label = $state('');
  let url = $state('');
  let customBasemaps = $state<BasemapOption[]>(loadCustomBasemaps());
  let customOverlays = $state<OverlayOption[]>(loadCustomOverlays());
  let validating = $state(false);
  let error = $state('');
  let controlElement = $state<HTMLElement | null>(null);
  let validationRevision = 0;

  $effect(() => {
    if (!selectedOverlay?.query) return;
    const index = customOverlays.findIndex((overlay) => overlay.id === selectedOverlay.id);
    if (index === -1 || customOverlays[index].query === selectedOverlay.query) return;
    customOverlays = customOverlays.map((overlay) =>
      overlay.id === selectedOverlay.id ? selectedOverlay : overlay
    );
    saveCustomOverlays(customOverlays);
  });

  function resetForm(): void {
    validationRevision += 1;
    validating = false;
    label = '';
    url = '';
    error = '';
    adding = null;
  }

  function closeMenu(): void {
    open = false;
    resetForm();
    hideTooltip();
  }

  $effect(() => {
    if (!open || !controlElement) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlElement?.contains(event.target)) closeMenu();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  });

  function selectBasemap(basemap: BasemapOption): void {
    onselect(basemap);
    open = false;
    resetForm();
  }

  function removeCustomBasemap(basemap: BasemapOption): void {
    customBasemaps = customBasemaps.filter((candidate) => candidate.id !== basemap.id);
    saveCustomBasemaps(customBasemaps);
    if (selected.id === basemap.id) onselect(ARTEMIS_BASEMAP);
  }

  function selectOverlay(overlay: OverlayOption | null): void {
    onOverlaySelect(overlay);
  }

  function removeCustomOverlay(overlay: OverlayOption): void {
    customOverlays = customOverlays.filter((candidate) => candidate.id !== overlay.id);
    saveCustomOverlays(customOverlays);
    if (selectedOverlay?.id === overlay.id) onOverlaySelect(null);
  }

  function overlayQueryWarning(overlay: OverlayOption): string | null {
    if (overlay.query?.status === 'supported') return overlay.query.error ?? null;
    if (overlay.query) return overlay.query.reason;
    // No probe result yet. Overlays carrying a serviceType are probed on first selection
    // (Canvas.svelte), so an unknown capability is not worth a warning; only a legacy stored
    // overlay without one — which nothing will ever probe — keeps the stale-query hint.
    return overlay.serviceType ? null : t().basemap.staleQueryWarning;
  }

  function showWarningTooltip(text: string, event: MouseEvent | FocusEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showTooltip({ text: format(t().basemap.noClickBehaviour, { warning: text }), x: rect.left + rect.width / 2, y: rect.top, placement: 'above' });
  }

  async function addCustomMapService(): Promise<void> {
    if (validating) return;
    const revision = ++validationRevision;
    error = '';
    validating = true;
    try {
      const resolved = resolveCustomBasemap(url);
      if (resolved.kind === 'wfs') await validateWfsGeoJson(resolved.url);
      else await validateTileImage(resolved.url);
      if (revision !== validationRevision) return;
      const hostname = new URL(resolved.url).hostname.replace(/^www\./, '');
      if (adding === 'overlay') {
        const query = await discoverOverlayQueryCapability(resolved);
        if (revision !== validationRevision) return;
        const overlay: OverlayOption = {
          id: `overlay-${Date.now()}`,
          label: label.trim() || hostname,
          kind: resolved.kind,
          url: resolved.url,
          serviceType: resolved.serviceType,
          query,
        };
        customOverlays = [...customOverlays, overlay];
        saveCustomOverlays(customOverlays);
        selectOverlay(overlay);
        resetForm();
      } else {
        const basemap: BasemapOption = {
          id: `custom-${Date.now()}`,
          label: label.trim() || hostname,
          kind: resolved.kind,
          url: resolved.url,
        };
        customBasemaps = [...customBasemaps, basemap];
        saveCustomBasemaps(customBasemaps);
        selectBasemap(basemap);
      }
    } catch (reason) {
      if (revision !== validationRevision) return;
      error = reason instanceof Error ? reason.message : t().basemap.addFailed;
    } finally {
      if (revision === validationRevision) validating = false;
    }
  }
</script>

<div class="basemap-control" bind:this={controlElement}>
  {#if open}
    <div class="basemap-popover">
      <Window
        variant="popover"
        placement="anchored"
        title={adding ? (adding === 'overlay' ? t().basemap.addOverlayTitle : t().basemap.addBasemapTitle) : activeSection === 'background' ? t().basemap.backgroundTitle : t().basemap.overlayTitle}
        showClose
        closeLabel={t().basemap.closeMenu}
        onclose={closeMenu}
        style="--window-width: min(21rem, calc(100vw - (2 * var(--space-4)))); --window-header-border-width: 0;"
      >
        {#if adding !== null}
          <div class="basemap-separator"><WaveSeparator /></div>
          <form class="basemap-form" onsubmit={(event) => { event.preventDefault(); void addCustomMapService(); }}>
            <label>
              <span>{t().basemap.urlLabel}</span>
              <input
                bind:value={url}
                autocomplete="off"
                spellcheck="false"
                placeholder={t().basemap.urlPlaceholder}
              />
            </label>
            <label>
              <span>{t().basemap.nameLabel} <small>{t().basemap.nameOptional}</small></span>
              <input bind:value={label} autocomplete="off" placeholder={t().basemap.namePlaceholder} />
            </label>
            {#if error}<p class="basemap-error" role="alert">{error}</p>{/if}
            <div class="form-actions">
              <Button type="button" onclick={resetForm}>{t().basemap.back}</Button>
              <Button variant="primary" type="submit" disabled={validating}>
                {validating ? t().basemap.checking : t().basemap.add}
              </Button>
            </div>
          </form>
        {:else}
          <div class="layer-tabs" aria-label={t().basemap.layerTypeGroup}>
            <Button
              class="layer-tab"
              active={activeSection === 'background'}
              aria-pressed={activeSection === 'background'}
              onclick={() => { activeSection = 'background'; }}
            >
              {t().basemap.backgroundTab}
            </Button>
            <Button
              class="layer-tab"
              active={activeSection === 'overlay'}
              aria-pressed={activeSection === 'overlay'}
              onclick={() => { activeSection = 'overlay'; }}
            >
              {t().basemap.overlayTab}
            </Button>
          </div>
          <div class="basemap-separator"><WaveSeparator /></div>

          {#if activeSection === 'background'}
            <section class="layer-section" aria-label={t().basemap.backgroundsSection}>
              <div class="layer-options">
                {#each BUILT_IN_BASEMAPS as basemap (basemap.id)}
                  <Button variant="list" title={basemap.longLabel ?? basemap.label} active={selected.id === basemap.id} onclick={() => selectBasemap(basemap)}>
                    {basemap.label}
                  </Button>
                {/each}
                {#each registeredBasemaps as basemap (basemap.id)}
                  <Button variant="list" title={basemap.longLabel ?? basemap.label} active={selected.id === basemap.id} onclick={() => selectBasemap(basemap)}>
                    {basemap.label}
                  </Button>
                {/each}
                {#each customBasemaps as basemap (basemap.id)}
                  <div class="custom-basemap-option">
                    <Button variant="list" active={selected.id === basemap.id} onclick={() => selectBasemap(basemap)}>
                      {basemap.label}
                    </Button>
                    <Button iconOnly aria-label={format(t().basemap.remove, { label: basemap.label })} onclick={() => removeCustomBasemap(basemap)}>
                      <svg class="remove-basemap-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path>
                      </svg>
                    </Button>
                  </div>
                {/each}
              </div>
              <div class="layer-section-action">
              <Button variant="list" onclick={() => { adding = 'basemap'; error = ''; }}>
                <span aria-hidden="true">＋</span> {t().basemap.addMapService}
              </Button>
              </div>
            </section>
          {:else}
            <section class="layer-section" aria-label={t().basemap.overlaysSection}>
              <div class="layer-options">
                <Button variant="list" active={selectedOverlay === null} onclick={() => selectOverlay(null)}>
                  No overlay
                </Button>
                {#each registeredOverlays as overlay (overlay.id)}
                  {@const displayedOverlay = selectedOverlay?.id === overlay.id ? selectedOverlay : overlay}
                  <div class="custom-basemap-option">
                    <Button variant="list" title={displayedOverlay.longLabel ?? displayedOverlay.label} active={selectedOverlay?.id === displayedOverlay.id} onclick={() => selectOverlay(displayedOverlay)}>
                      {displayedOverlay.label}
                    </Button>
                    {#if overlayQueryWarning(displayedOverlay) !== null}
                      {@const warning = overlayQueryWarning(displayedOverlay)!}
                      <div class="overlay-option-actions">
                        <Button
                          iconOnly
                          class="overlay-warning"
                          aria-label={format(t().basemap.noClickBehaviourFor, { label: displayedOverlay.label, warning })}
                          onmouseenter={(event) => showWarningTooltip(warning, event)}
                          onmouseleave={hideTooltip}
                          onfocus={(event) => showWarningTooltip(warning, event)}
                          onblur={hideTooltip}
                        >!</Button>
                      </div>
                    {/if}
                  </div>
                {/each}
                {#each customOverlays as overlay (overlay.id)}
                  {@const displayedOverlay = selectedOverlay?.id === overlay.id ? selectedOverlay : overlay}
                  <div class="custom-basemap-option">
                    <Button variant="list" active={selectedOverlay?.id === displayedOverlay.id} onclick={() => selectOverlay(displayedOverlay)}>
                      {displayedOverlay.label}
                    </Button>
                    <div class="overlay-option-actions">
                      {#if overlayQueryWarning(displayedOverlay) !== null}
                        {@const warning = overlayQueryWarning(displayedOverlay)!}
                        <Button
                          iconOnly
                          class="overlay-warning"
                          aria-label={format(t().basemap.noClickBehaviourFor, { label: displayedOverlay.label, warning })}
                          onmouseenter={(event) => showWarningTooltip(warning, event)}
                          onmouseleave={hideTooltip}
                          onfocus={(event) => showWarningTooltip(warning, event)}
                          onblur={hideTooltip}
                        >!</Button>
                      {/if}
                      <Button iconOnly aria-label={format(t().basemap.remove, { label: overlay.label })} onclick={() => removeCustomOverlay(overlay)}>
                        <svg class="remove-basemap-icon" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path>
                        </svg>
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
              {#if selectedOverlay}
                <label class="opacity-control">
                  <span>{t().basemap.transparency}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((1 - overlayOpacity) * 100)}
                    aria-label={t().basemap.transparencyAria}
                    oninput={(event) => {
                      onOverlayOpacityChange(1 - Number(event.currentTarget.value) / 100);
                    }}
                  />
                  <output>{Math.round((1 - overlayOpacity) * 100)}%</output>
                </label>
              {/if}
              <div class="layer-section-action">
                <Button variant="list" onclick={() => { adding = 'overlay'; error = ''; }}>
                  <span aria-hidden="true">＋</span> {t().basemap.addOverlayService}
                </Button>
              </div>
            </section>
          {/if}
        {/if}
      </Window>
    </div>
  {/if}

  <Button
    iconOnly
    active={open}
    aria-label={t().basemap.trigger}
    aria-expanded={open}
    onclick={() => { if (open) closeMenu(); else open = true; }}
    style="--button-height: var(--canvas-primary-control-height);"
  >
    <svg class="basemap-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"></path>
      <path d="M9 3v15M15 6v15"></path>
    </svg>
  </Button>
</div>

<style>
  .basemap-control {
    /* -- exposed -- */
    --basemap-popover-offset: var(--space-3);
    /* -- end exposed -- */

    position: relative;
    display: flex;
  }

  .basemap-popover {
    position: absolute;
    right: 0;
    bottom: calc(100% + var(--basemap-popover-offset));
  }

  .layer-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) var(--space-1);
  }

  :global(.layer-tab) {
    --button-height: 2rem;
  }

  .custom-basemap-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1);
  }

  .overlay-option-actions {
    display: flex;
    gap: var(--space-1);
  }

  :global(.overlay-warning) {
    --button-text: var(--color-text-error);
  }

  .remove-basemap-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .basemap-separator {
    position: relative;
    height: var(--space-4);
  }

  .layer-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  .layer-options {
    display: flex;
    flex-direction: column;
  }

  .layer-section-action {
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }

  .opacity-control {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 3rem;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
  }

  .opacity-control input {
    width: 100%;
    accent-color: var(--color-accent);
  }

  .opacity-control output {
    text-align: right;
  }

  .basemap-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .basemap-form label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .basemap-form small {
    color: var(--color-text-muted);
    font-size: inherit;
  }

  .basemap-form input {
    min-height: 2.25rem;
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    background: var(--color-surface-control);
    color: var(--color-text-primary);
    font: inherit;
  }

  .basemap-form input:focus {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .basemap-error {
    margin: 0;
    color: var(--color-text-error);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .basemap-icon {
    width: calc(1rem * 1.5);
    height: calc(1rem * 1.5);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
