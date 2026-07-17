<script lang="ts">
  import Window from '$lib/shared/primitives/Window.svelte';
  import Button from '$lib/shared/primitives/Button.svelte';
  import WaveSeparator from '$lib/shared/primitives/WaveSeparator.svelte';
  import DeveloperSettingsPanel from '$lib/features/developerSettings/DeveloperSettingsPanel.svelte';
  import { i18n, paragraphs, t, LOCALES, LOCALE_NAMES, LOCALE_SHORT_LABELS } from '$lib/shared/i18n/i18nStore.svelte';
  import { SITE_TITLE, TEAM, PARTNER_LOGOS, PIPELINE_URL, VIEWER_URL } from './aboutData';

  let { style = '' }: { style?: string } = $props();

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
      aria-label={t().branding.openInfo}
      aria-expanded={isOpen}
      onclick={open}
      style="--button-height: var(--branding-button-height); --button-padding-inline: var(--branding-button-padding-inline); --button-gap: var(--branding-button-gap); --button-overflow: hidden;"
    >
      <svg class="branding-gradient" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect class="branding-gradient-band branding-gradient-band--1" width="15" height="100" />
        <rect class="branding-gradient-band branding-gradient-band--2" x="15" width="35" height="100" />
        <rect class="branding-gradient-band branding-gradient-band--3" x="50" width="50" height="100" />
      </svg>
      <svg class="branding-logo" viewBox="0 0 26 40" aria-hidden="true">
        <path
          d="M13,-30 L13,-14 C24,-3 3,11 13,21 C20,28 13,41 13,54 L13,70"
          fill="none"
          stroke="currentColor"
          stroke-width="7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="branding-text">
        <span class="branding-title">ARTEMIS</span>
        <span class="branding-subtitle">{SITE_TITLE}</span>
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
        closeLabel={t().branding.closePanel}
        onclose={close}
        style="--window-width: var(--branding-modal-width); --window-height: var(--branding-modal-height);"
      >
        {#snippet header()}
          <div class="branding-header">
            <div class="branding-tabs">
              <Button active={activeTab === 'about'} onclick={() => (activeTab = 'about')}>{t().branding.aboutTab}</Button>
              <Button active={activeTab === 'pipeline'} onclick={() => (activeTab = 'pipeline')}>{t().branding.pipeline.title}</Button>
            </div>
            <div class="branding-lang" role="group" aria-label={t().branding.language}>
              {#each LOCALES as locale (locale)}
                <Button
                  active={i18n.locale === locale}
                  aria-label={LOCALE_NAMES[locale]}
                  onclick={() => i18n.setLocale(locale)}
                >{LOCALE_SHORT_LABELS[locale]}</Button>
              {/each}
            </div>
          </div>
        {/snippet}

        <div class="branding-body">
          {#if activeTab === 'about'}
            <h3>{SITE_TITLE}</h3>
            {#each paragraphs(t().branding.info) as paragraph (paragraph)}
              <p>{paragraph}</p>
            {/each}

            <section class="branding-section">
              <WaveSeparator />
              <h4>{t().branding.team}</h4>
              {#each TEAM as institution (institution.name)}
                <div class="team-institution">
                  <strong>{institution.name}</strong>
                  {#each institution.units as unit (unit.name)}
                    <div class="team-unit">
                      <span class="team-unit-name">{unit.name}</span>
                      <ul>
                        {#each unit.members as member (member.name)}
                          <li>{member.name}, {t().branding.roles[member.role]}</li>
                        {/each}
                      </ul>
                    </div>
                  {/each}
                </div>
              {/each}
            </section>

            <section class="branding-section">
              <WaveSeparator />
              <h4>{t().branding.partners}</h4>
              <div class="logo-grid">
                {#each PARTNER_LOGOS as logo (logo.src)}
                  <a href={logo.href} title={logo.name} target="_blank" rel="noopener noreferrer">
                    <img src={logo.src} alt={logo.alt} />
                  </a>
                {/each}
              </div>
            </section>

            <section class="branding-section developer-section">
              <WaveSeparator />
              <details>
                <summary>Developer settings</summary>
                <div class="developer-settings-panel">
                  <DeveloperSettingsPanel />
                </div>
              </details>
            </section>

          {:else}
            <h3>{t().branding.pipeline.title}</h3>
            {#each paragraphs(t().branding.pipeline.info) as paragraph (paragraph)}
              <p>{paragraph}</p>
            {/each}
            <p><a href={PIPELINE_URL} target="_blank" rel="noopener noreferrer">{t().branding.pipeline.dataLinkLabel}</a></p>
            <p><a href={VIEWER_URL} target="_blank" rel="noopener noreferrer">{t().branding.pipeline.viewerLinkLabel}</a></p>
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
    --branding-gradient-width: 40%;
    --branding-text-gap: 0.08rem;
    --branding-title-size: 0.7875rem;
    --branding-subtitle-size: 0.6975rem;
    --branding-modal-width: min(60rem, 92vw);
    --branding-modal-height: min(68rem, 94vh);
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
    position: relative;
    width: var(--branding-logo-width);
    height: var(--branding-logo-height);
    overflow: visible;
    color: var(--color-accent);
  }

  .branding-text {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--branding-text-gap);
    line-height: 1.1;
  }

  .branding-gradient {
    position: absolute;
    inset: 0 0 0 auto;
    width: var(--branding-gradient-width);
    height: 100%;
    pointer-events: none;
  }

  .branding-gradient-band {
    stroke: none;
  }

  .branding-gradient-band--1 {
    fill: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-control));
  }

  .branding-gradient-band--2 {
    fill: color-mix(in srgb, var(--color-accent) 18%, var(--color-surface-control));
  }

  .branding-gradient-band--3 {
    fill: color-mix(in srgb, var(--color-accent) 30%, var(--color-surface-control));
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

  /* Fills the window header's leading area so the language switcher can sit
     opposite the tabs, just before the window's close button. */
  .branding-header {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
  }

  .branding-tabs,
  .branding-lang {
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

  .developer-section summary {
    color: var(--color-text-muted);
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .developer-section summary:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .developer-settings-panel {
    margin-top: var(--space-3);
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
