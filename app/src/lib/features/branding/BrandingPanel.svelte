<script lang="ts">
  import Window from '$lib/shared/primitives/Window.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Toggle from '$lib/shared/primitives/Toggle.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import type { DatasetSource } from '$lib/core/dataset/dataSource';
  import type { SiteMetadata } from '$lib/core/dataset/siteMetadata';
  import type {
    AllmapsOverviewTilesSelection,
    AllmapsTransformation,
    AllmapsTuningOptions,
    IiifLoadingMode,
  } from '$lib/core/renderers/types';
  import { developerSettings } from '$lib/features/developerSettings/developerSettings.svelte';

  let { siteMetadata, style = '' }: { siteMetadata: SiteMetadata; style?: string } = $props();

  type Tab = 'about' | 'pipeline';
  type TuningNumberKey = Exclude<keyof AllmapsTuningOptions, 'overviewTilesMaxResolution' | 'overviewTilesSelection'>;

  let isOpen = $state(false);
  let activeTab = $state<Tab>('about');

  function onTuningNumberChange(key: TuningNumberKey, event: Event & { currentTarget: HTMLInputElement }): void {
    const value = Number.parseFloat(event.currentTarget.value);
    if (Number.isFinite(value)) {
      developerSettings.setAllmapsTuning({ [key]: value });
    } else {
      event.currentTarget.value = String(developerSettings.allmapsTuning[key]);
    }
  }

  function onOverviewMaxResolutionChange(event: Event & { currentTarget: HTMLInputElement }): void {
    const text = event.currentTarget.value.trim();
    if (text === '') {
      developerSettings.setAllmapsTuning({ overviewTilesMaxResolution: undefined });
      return;
    }
    const value = Number.parseFloat(text);
    if (Number.isFinite(value)) {
      developerSettings.setAllmapsTuning({ overviewTilesMaxResolution: value });
    } else {
      event.currentTarget.value = developerSettings.allmapsTuning.overviewTilesMaxResolution?.toString() ?? '';
    }
  }

  const pipeline = $derived(siteMetadata.pipeline);
  const hasPipeline = $derived(pipeline.info.length > 0 || pipeline.links.length > 0);

  function open(): void {
    isOpen = true;
    activeTab = 'about';
  }

  function close(): void {
    isOpen = false;
  }
</script>

<div class="branding" {style}>
  <div class="branding-trigger-scale">
    <Button
      class="branding-trigger"
      aria-label="Open project information"
      aria-expanded={isOpen}
      onclick={open}
      style="--button-height: var(--branding-button-height); --button-padding-inline: var(--branding-button-padding-inline); --button-gap: var(--branding-button-gap);"
    >
      <svg class="branding-logo" viewBox="0 0 26 40" aria-hidden="true">
        <path d="M13,3 C24,9 3,15 13,21 C20,24 13,31 13,37" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" />
      </svg>
      <span class="branding-text">
        <span class="branding-title">ARTEMIS</span>
        <span class="branding-subtitle">Schelde Gemapt</span>
      </span>
    </Button>
  </div>

  {#if isOpen}
    <div class="branding-modal-layer">
      <Window
        class="branding-window"
        variant="modal"
        placement="center"
        backdrop
        closeOnEscape
        showClose
        closeLabel="Close panel"
        onclose={close}
        style="--window-width: var(--branding-modal-width); --window-height: var(--branding-modal-height);"
      >
        {#snippet header()}
          <div class="branding-tabs">
            <Button active={activeTab === 'about'} onclick={() => (activeTab = 'about')}>About</Button>
            {#if hasPipeline}
              <Button active={activeTab === 'pipeline'} onclick={() => (activeTab = 'pipeline')}>{pipeline.title}</Button>
            {/if}
          </div>
        {/snippet}

        <div class="branding-body">
          {#if activeTab === 'about'}
            <h3>{siteMetadata.title}</h3>
            {#each siteMetadata.info as paragraph (paragraph)}
              <p>{paragraph}</p>
            {/each}

            {#if siteMetadata.team.length > 0}
              <section class="branding-section">
                <WaveSeparator />
                <h4>Team</h4>
                {#each siteMetadata.team as institution (institution.institution)}
                  <div class="team-institution">
                    <strong>{institution.institution}</strong>
                    {#each institution.units as unit, index (index)}
                      <div class="team-unit">
                        {#if unit.unit}
                          <span class="team-unit-name">{unit.unit}</span>
                        {/if}
                        {#if unit.members.length > 0}
                          <ul>
                            {#each unit.members as member (member)}
                              <li>{member}</li>
                            {/each}
                          </ul>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/each}
              </section>
            {/if}

            {#if siteMetadata.logos.length > 0}
              <section class="branding-section">
                <WaveSeparator />
                <h4>Partners</h4>
                <div class="logo-grid">
                  {#each siteMetadata.logos as logo (logo.src)}
                    <a href={logo.href ?? undefined} title={logo.label} target="_blank" rel="noopener noreferrer">
                      <img src={logo.src} alt={logo.alt} />
                    </a>
                  {/each}
                </div>
              </section>
            {/if}

            {#if siteMetadata.attribution}
              <section class="branding-section branding-attribution">
                <WaveSeparator />
                <p>{siteMetadata.attribution}</p>
              </section>
            {/if}

            <section class="branding-section developer-section">
              <WaveSeparator />
              <details>
                <summary>Developer settings</summary>
                <div class="developer-controls">
                  <label class="developer-control developer-control--stacked">
                    <span>Georeferencing transformation</span>
                    <select
                      value={developerSettings.transformation}
                      onchange={(event) => developerSettings.setTransformation(event.currentTarget.value as AllmapsTransformation)}
                    >
                      <option value="thinPlateSpline">Thin plate spline</option>
                      <option value="polynomial1">Polynomial</option>
                    </select>
                  </label>

                  <div class="developer-control">
                    <span>Debug triangulation</span>
                    <Toggle
                      label="Debug triangulation"
                      checked={developerSettings.debugTriangles}
                      onclick={() => developerSettings.setDebugTriangles(!developerSettings.debugTriangles)}
                    />
                  </div>

                  <div class="developer-control">
                    <span>Show high-stretch regions</span>
                    <Toggle
                      label="Show high-stretch regions"
                      checked={developerSettings.showHighStretch}
                      onclick={() => developerSettings.setShowHighStretch(!developerSettings.showHighStretch)}
                    />
                  </div>

                  <label class="developer-control developer-control--stacked">
                    <span>IIIF loading mode</span>
                    <select
                      value={developerSettings.iiifLoadingMode}
                      onchange={(event) => developerSettings.setIiifLoadingMode(event.currentTarget.value as IiifLoadingMode)}
                    >
                      <option value="sequential">Sequential (viewport)</option>
                      <option value="eager">Eager (all maps)</option>
                    </select>
                  </label>

                  <div class="developer-control">
                    <span>IIIF sprite thumbnails</span>
                    <Toggle
                      label="IIIF sprite thumbnails"
                      checked={developerSettings.allmapsSprites}
                      onclick={() => developerSettings.setAllmapsSprites(!developerSettings.allmapsSprites)}
                    />
                  </div>

                  <div class="developer-control">
                    <span>Allmaps performance diagnostics</span>
                    <Toggle
                      label="Allmaps performance diagnostics"
                      checked={developerSettings.allmapsDiagnostics}
                      onclick={() => developerSettings.setAllmapsDiagnostics(!developerSettings.allmapsDiagnostics)}
                    />
                  </div>

                  <details class="allmaps-advanced">
                    <summary>Advanced Allmaps</summary>
                    <div class="developer-controls">
                      <label class="developer-control">
                        <span>Scale factor correction (log2)</span>
                        <input
                          type="number"
                          step="0.25"
                          value={developerSettings.allmapsTuning.log2ScaleFactorCorrection}
                          onchange={(event) => onTuningNumberChange('log2ScaleFactorCorrection', event)}
                        />
                      </label>

                      <label class="developer-control">
                        <span>Prune viewport buffer ratio</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={developerSettings.allmapsTuning.pruneViewportBufferRatio}
                          onchange={(event) => onTuningNumberChange('pruneViewportBufferRatio', event)}
                        />
                      </label>

                      <label class="developer-control">
                        <span>Overview request buffer ratio</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={developerSettings.allmapsTuning.overviewRequestViewportBufferRatio}
                          onchange={(event) => onTuningNumberChange('overviewRequestViewportBufferRatio', event)}
                        />
                      </label>

                      <label class="developer-control">
                        <span>Overview prune buffer ratio</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={developerSettings.allmapsTuning.overviewPruneViewportBufferRatio}
                          onchange={(event) => onTuningNumberChange('overviewPruneViewportBufferRatio', event)}
                        />
                      </label>

                      <label class="developer-control">
                        <span>Max total overview resolution ratio</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={developerSettings.allmapsTuning.maxTotalOverviewResolutionRatio}
                          onchange={(event) => onTuningNumberChange('maxTotalOverviewResolutionRatio', event)}
                        />
                      </label>

                      <label class="developer-control">
                        <span>Overview tiles max resolution</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="auto"
                          value={developerSettings.allmapsTuning.overviewTilesMaxResolution ?? ''}
                          onchange={onOverviewMaxResolutionChange}
                        />
                      </label>

                      <label class="developer-control developer-control--stacked">
                        <span>Overview tiles selection</span>
                        <select
                          value={developerSettings.allmapsTuning.overviewTilesSelection}
                          onchange={(event) =>
                            developerSettings.setAllmapsTuning({
                              overviewTilesSelection: event.currentTarget.value as AllmapsOverviewTilesSelection,
                            })}
                        >
                          <option value="lowest">Lowest zoom level</option>
                          <option value="highest">Highest zoom level</option>
                        </select>
                      </label>
                    </div>
                  </details>

                  <label class="developer-control developer-control--stacked">
                    <span>Data source</span>
                    <select
                      value={developerSettings.dataSource}
                      onchange={(event) => developerSettings.setDataSource(event.currentTarget.value as DatasetSource)}
                    >
                      <option value="published">Published data</option>
                      <option value="draft">Draft branch</option>
                    </select>
                  </label>
                  <Button onclick={() => developerSettings.resetDefaults()} style="--button-width: 100%;">Reset defaults</Button>
                  <p class="developer-warning">Warning: curiousity killed the cat</p>
                </div>
              </details>
            </section>
          {:else}
            <h3>{pipeline.title}</h3>
            {#each pipeline.info as paragraph (paragraph)}
              <p>{paragraph}</p>
            {/each}
            {#each pipeline.links as link (link.url)}
              <p><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></p>
            {/each}
          {/if}
        </div>
      </Window>
    </div>
  {/if}
</div>

<style>
  .branding {
    /* -- exposed -- */
    --branding-scale: 1;
    --branding-button-height: 3rem;
    --branding-button-padding-inline: 0.5rem;
    --branding-button-gap: 0.55rem;
    --branding-logo-width: 1.05rem;
    --branding-logo-height: 2rem;
    --branding-text-gap: 0.08rem;
    --branding-title-size: 0.6rem;
    --branding-subtitle-size: 0.51rem;
    --branding-modal-width: min(44rem, 92vw);
    --branding-modal-height: min(54rem, 82vh);
    /* -- end exposed -- */

    display: flex;
  }

  /* Each dimension above is its own rem value, tunable independently (set via
     inline style on the Button, since a :global() class rule ties with
     Button's own default rule at equal specificity and isn't reliable — see
     Button's style prop above). --branding-scale is the one knob that still
     needs to move the whole lockup as a unit, so it's a transform rather than
     another factor threaded through every calc() — scoped to this wrapper
     alone (not .branding) because a transformed ancestor becomes the
     containing block for position: fixed descendants, which would break
     .branding-modal-layer's full-viewport fixed positioning. */
  .branding-trigger-scale {
    transform: scale(var(--branding-scale));
    transform-origin: top left;
  }

  .branding-logo {
    width: var(--branding-logo-width);
    height: var(--branding-logo-height);
    color: var(--color-accent);
  }

  .branding-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--branding-text-gap);
    line-height: 1.1;
  }

  .branding-title {
    font-size: var(--branding-title-size);
    font-weight: 700;
    letter-spacing: 0.25em;
  }

  .branding-subtitle {
    color: var(--color-accent);
    font-size: var(--branding-subtitle-size);
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .branding-modal-layer {
    position: fixed;
    inset: 0;
    z-index: var(--z-popover);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.branding-window) {
    min-width: 0;
    max-width: 92vw;
  }

  :global(.branding-window .window-body) {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }

  .branding-tabs {
    display: flex;
    gap: var(--space-1);
  }

  .branding-body {
    padding: var(--space-4);
  }

  .branding-body h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--text-base);
    font-weight: 700;
  }

  .branding-body p {
    margin: 0 0 var(--space-3);
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .branding-body a {
    color: var(--color-accent);
  }

  .branding-section {
    position: relative;
    margin-top: var(--space-4);
    padding-top: var(--space-3);
  }

  .branding-section h4 {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .team-institution {
    margin-bottom: var(--space-3);
  }

  .team-institution strong {
    display: block;
    margin-bottom: var(--space-1);
    font-size: var(--text-sm);
  }

  .team-unit {
    margin-left: var(--space-3);
    font-size: var(--text-xs);
  }

  .team-unit-name {
    color: var(--color-text-secondary);
    font-weight: 700;
  }

  .team-unit ul {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-4);
    color: var(--color-text-muted);
  }

  .team-unit li {
    margin: var(--space-1) 0;
  }

  .logo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
    gap: var(--space-3);
  }

  .logo-grid a {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xs);
    padding: var(--space-2);
    transition: border-color 150ms ease, background 150ms ease;
  }

  .logo-grid a:hover {
    border-color: var(--color-border-hover);
    background: var(--color-surface-control-hover);
  }

  .logo-grid img {
    max-width: 100%;
    max-height: 3.5rem;
    object-fit: contain;
  }

  .branding-attribution p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .developer-section summary {
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .developer-section details,
  .developer-controls,
  .developer-control {
    min-width: 0;
    max-width: 100%;
  }

  .developer-section summary:focus-visible,
  .developer-section select:focus-visible,
  .developer-section input:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .developer-controls {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .developer-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
  }

  .developer-control--stacked {
    align-items: stretch;
    flex-direction: column;
    gap: var(--space-1);
  }

  .developer-control select,
  .developer-control input[type='number'] {
    width: 100%;
    max-width: 100%;
    min-height: 1.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    padding: 0 var(--space-2);
    background: var(--color-surface-control);
    color: var(--color-text-primary);
    font: inherit;
  }

  .developer-control select:hover,
  .developer-control input[type='number']:hover {
    border-color: var(--color-border-hover);
    background: var(--color-surface-control-hover);
  }

  /* Number inputs sit inline on their row (unlike the full-width stacked selects),
     so cap their width to keep the label legible. */
  .developer-control input[type='number'] {
    flex: none;
    width: 6rem;
    text-align: right;
  }

  /* Reads as a control-level disclosure, not a section header: undo the uppercase
     header treatment inherited from the .developer-section summary rule above. */
  .allmaps-advanced summary {
    color: var(--color-text-secondary);
    font-family: var(--font-readable);
    font-size: var(--text-sm);
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
  }

  .allmaps-advanced .developer-controls {
    border-left: 1px solid var(--color-border-subtle);
    padding-left: var(--space-3);
  }

  .developer-controls .developer-warning {
    margin: 0;
    color: var(--color-text-muted);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    font-style: italic;
  }

  /* Portrait windows are too narrow for the full lockup: collapse the trigger
     to just the logo, matching the compare/search controls. --button-width is
     not in the trigger's inline style, so this rule can win; last in the
     stylesheet so it also outranks the base rules above. */
  @media (orientation: portrait) {
    .branding-trigger-scale :global(.branding-trigger) {
      --button-width: var(--branding-button-height);
    }

    .branding-text {
      display: none;
    }
  }
</style>
