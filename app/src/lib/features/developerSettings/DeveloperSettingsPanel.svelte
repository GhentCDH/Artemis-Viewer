<script lang="ts">
  import type { DatasetSource } from '$lib/core/dataset/dataSource';
  import type {
    AllmapsOverviewTilesSelection,
    AllmapsTransformation,
    AllmapsTuningOptions,
    IiifLoadingMode,
  } from '$lib/core/renderers/types';
  import Button from '$lib/shared/primitives/Button.svelte';
  import Toggle from '$lib/shared/primitives/Toggle.svelte';
  import { developerSettings } from './developerSettings.svelte';

  type TuningNumberKey = Exclude<keyof AllmapsTuningOptions, 'overviewTilesMaxResolution' | 'overviewTilesSelection'>;

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
</script>

<div class="developer-settings">
  <header class="developer-intro">
    <h3>Developer settings</h3>
    <p>Rendering diagnostics and experimental data controls. Changes are saved in this browser.</p>
  </header>

  <div class="developer-actions">
    <Button onclick={() => developerSettings.resetDefaults()} style="--button-width: 100%;">Reset defaults</Button>
    <p>Warning: curiousity killed the cat</p>
  </div>

  <section class="developer-group" aria-labelledby="developer-data-heading">
    <h4 id="developer-data-heading">Data</h4>
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
  </section>

  <section class="developer-group" aria-labelledby="developer-rendering-heading">
    <h4 id="developer-rendering-heading">Rendering debug</h4>
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
        <span>Debug IIIF tiles</span>
        <Toggle
          label="Debug IIIF tiles"
          checked={developerSettings.debugTiles}
          onclick={() => developerSettings.setDebugTiles(!developerSettings.debugTiles)}
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
    </div>
  </section>

  <section class="developer-group" aria-labelledby="developer-loading-heading">
    <h4 id="developer-loading-heading">IIIF loading</h4>
    <div class="developer-controls">
      <label class="developer-control developer-control--stacked">
        <span>Loading mode</span>
        <select
          value={developerSettings.iiifLoadingMode}
          onchange={(event) => developerSettings.setIiifLoadingMode(event.currentTarget.value as IiifLoadingMode)}
        >
          <option value="sequential">Sequential (viewport)</option>
          <option value="eager">Eager (all maps)</option>
        </select>
      </label>

      <div class="developer-control">
        <span>Sprite thumbnails</span>
        <Toggle
          label="IIIF sprite thumbnails"
          checked={developerSettings.allmapsSprites}
          onclick={() => developerSettings.setAllmapsSprites(!developerSettings.allmapsSprites)}
        />
      </div>
    </div>
  </section>

  <section class="developer-group" aria-labelledby="developer-diagnostics-heading">
    <h4 id="developer-diagnostics-heading">Diagnostics</h4>
    <div class="developer-controls">
      <div class="developer-control">
        <span>Performance diagnostics</span>
        <Toggle
          label="Allmaps performance diagnostics"
          checked={developerSettings.allmapsDiagnostics}
          onclick={() => developerSettings.setAllmapsDiagnostics(!developerSettings.allmapsDiagnostics)}
        />
      </div>

      <div class="developer-control">
        <span>Tile cache log</span>
        <Toggle
          label="Allmaps tile cache log"
          checked={developerSettings.allmapsTileCacheLog}
          onclick={() => developerSettings.setAllmapsTileCacheLog(!developerSettings.allmapsTileCacheLog)}
        />
      </div>

      <div class="developer-control">
        <span>GPU texture log</span>
        <Toggle
          label="Allmaps GPU texture log"
          checked={developerSettings.allmapsTextureLog}
          onclick={() => developerSettings.setAllmapsTextureLog(!developerSettings.allmapsTextureLog)}
        />
      </div>

      <div class="developer-control">
        <span>PBO log</span>
        <Toggle
          label="Allmaps PBO log"
          checked={developerSettings.allmapsPboLog}
          onclick={() => developerSettings.setAllmapsPboLog(!developerSettings.allmapsPboLog)}
        />
      </div>
    </div>
  </section>

  <section class="developer-group" aria-labelledby="developer-advanced-heading">
    <h4 id="developer-advanced-heading">Advanced Allmaps</h4>
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
  </section>

</div>

<style>
  .developer-settings,
  .developer-controls {
    display: grid;
    gap: var(--space-3);
  }

  .developer-intro h3,
  .developer-intro p,
  .developer-group h4,
  .developer-actions p {
    margin: 0;
  }

  .developer-intro h3 {
    font-size: var(--text-base);
  }

  .developer-intro p,
  .developer-actions p {
    color: var(--color-text-muted);
    font-family: var(--font-readable);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .developer-group {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    border-top: 1px solid var(--color-border-subtle);
    padding-top: var(--space-3);
  }

  .developer-group h4 {
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .developer-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
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

  .developer-control select:focus-visible,
  .developer-control input:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .developer-control input[type='number'] {
    flex: none;
    width: 6rem;
    text-align: right;
  }

  .developer-actions {
    display: grid;
    gap: var(--space-2);
  }
</style>
