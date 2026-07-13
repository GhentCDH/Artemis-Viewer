<script lang="ts">
  import { ARTEMIS_BASEMAP, BUILT_IN_BASEMAPS, type BasemapOption } from '$lib/core/map/basemap';
  import Button from '$lib/shared/primitives/Button.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import Window from '$lib/shared/primitives/Window.svelte';
  import {
    loadCustomBasemaps,
    resolveCustomBasemap,
    saveCustomBasemaps,
    validateTileImage,
    validateWfsGeoJson,
  } from './customBasemap';

  let {
    selected,
    onselect,
  }: {
    selected: BasemapOption;
    onselect: (basemap: BasemapOption) => void;
  } = $props();

  let open = $state(false);
  let adding = $state(false);
  let label = $state('');
  let url = $state('');
  let customBasemaps = $state<BasemapOption[]>(loadCustomBasemaps());
  let validating = $state(false);
  let error = $state('');

  function resetForm(): void {
    label = '';
    url = '';
    error = '';
    adding = false;
  }

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

  async function addCustomBasemap(): Promise<void> {
    if (validating) return;
    error = '';
    validating = true;
    try {
      const resolved = resolveCustomBasemap(url);
      if (resolved.kind === 'wfs') await validateWfsGeoJson(resolved.url);
      else await validateTileImage(resolved.url);
      const hostname = new URL(resolved.url).hostname.replace(/^www\./, '');
      const basemap: BasemapOption = {
        id: `custom-${Date.now()}`,
        label: label.trim() || hostname,
        kind: resolved.kind,
        url: resolved.url,
      };
      customBasemaps = [...customBasemaps, basemap];
      saveCustomBasemaps(customBasemaps);
      selectBasemap(basemap);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to add this basemap.';
    } finally {
      validating = false;
    }
  }
</script>

<div class="basemap-control">
  {#if open}
    <div class="basemap-popover">
      <Window
        variant="popover"
        placement="anchored"
        title={adding ? 'Add basemap' : 'Background map'}
        showClose
        closeLabel="Close basemap menu"
        onclose={() => {
          open = false;
          resetForm();
        }}
        style="--window-width: min(21rem, calc(100vw - (2 * var(--space-4)))); --window-header-border-width: 0;"
      >
        <div class="basemap-separator"><WaveSeparator /></div>
        {#if adding}
          <form class="basemap-form" onsubmit={(event) => { event.preventDefault(); void addCustomBasemap(); }}>
            <label>
              <span>Tile URL</span>
              <input
                bind:value={url}
                autocomplete="off"
                spellcheck="false"
                placeholder="XYZ, WMTS, WMS, or WFS URL"
              />
            </label>
            <label>
              <span>Name <small>(optional)</small></span>
              <input bind:value={label} autocomplete="off" placeholder="Uses the server name by default" />
            </label>
            {#if error}<p class="basemap-error" role="alert">{error}</p>{/if}
            <div class="form-actions">
              <Button type="button" onclick={resetForm}>Back</Button>
              <Button variant="primary" type="submit" disabled={validating}>
                {validating ? 'Checking…' : 'Add'}
              </Button>
            </div>
          </form>
        {:else}
          <div class="basemap-options">
            {#each BUILT_IN_BASEMAPS as basemap (basemap.id)}
              <Button variant="list" active={selected.id === basemap.id} onclick={() => selectBasemap(basemap)}>
                {basemap.label}
              </Button>
            {/each}
            {#each customBasemaps as basemap (basemap.id)}
              <div class="custom-basemap-option">
                <Button variant="list" active={selected.id === basemap.id} onclick={() => selectBasemap(basemap)}>
                  {basemap.label}
                </Button>
                <Button
                  iconOnly
                  aria-label={`Remove ${basemap.label}`}
                  onclick={() => removeCustomBasemap(basemap)}
                >
                  <svg class="remove-basemap-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path>
                  </svg>
                </Button>
              </div>
            {/each}
            <div class="add-basemap-action">
              <WaveSeparator />
              <Button variant="list" onclick={() => { adding = true; error = ''; }}>
                <span aria-hidden="true">＋</span> Add map service…
              </Button>
            </div>
          </div>
        {/if}
      </Window>
    </div>
  {/if}

  <Button
    iconOnly
    active={open}
    aria-label="Choose background map"
    aria-expanded={open}
    onclick={() => { open = !open; if (!open) resetForm(); }}
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

  .basemap-options {
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
  }

  .custom-basemap-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1);
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

  .add-basemap-action {
    position: relative;
    margin-top: var(--space-2);
    padding-top: var(--space-4);
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
