<script lang="ts">
  import Window from '$lib/shared/primitives/Window.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import type { SiteMetadata } from '$lib/core/dataset/siteMetadata';

  let { siteMetadata, style = '' }: { siteMetadata: SiteMetadata; style?: string } = $props();

  type Tab = 'about' | 'pipeline';

  let isOpen = $state(false);
  let activeTab = $state<Tab>('about');

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
      <Window class="branding-window" variant="modal" placement="center" backdrop closeOnEscape showClose closeLabel="Close panel" onclose={close}>
        {#snippet header()}
          <div class="branding-tabs">
            <Button active={activeTab === 'about'} onclick={() => (activeTab = 'about')}>About</Button>
            <Button active={activeTab === 'pipeline'} onclick={() => (activeTab = 'pipeline')}>Data pipeline</Button>
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
          {:else}
            <h3>Data pipeline</h3>
            <p>
              Every layer in this viewer is produced by the Artemis-Data build pipeline — georeferencing,
              tiling and search-index generation from source scans and archival maps.
            </p>
            <p><a href="https://github.com/GhentCDH/Artemis-Data" target="_blank" rel="noopener noreferrer">View the pipeline on GitHub</a></p>
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
    width: var(--branding-modal-width);
    height: var(--branding-modal-height);
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
</style>
