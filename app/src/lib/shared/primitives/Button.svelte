<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style'> {
    variant?: 'default' | 'primary' | 'prominent' | 'list';
    iconOnly?: boolean;
    active?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    style?: string;
    children?: Snippet;
  }

  let {
    variant = 'default',
    iconOnly = false,
    active = false,
    disabled = false,
    type = 'button',
    class: className = '',
    style = '',
    children,
    ...rest
  }: Props = $props();
</script>

<button
  {...rest}
  {type}
  {disabled}
  {style}
  class={`button button--${variant} ${iconOnly ? 'button--icon-only' : ''} ${active ? 'is-active' : ''} ${className}`}
  aria-pressed={active ? 'true' : undefined}
>
  {@render children?.()}
</button>

<style>
  .button {
    /* -- exposed -- */
    --button-bg: var(--color-surface-control);
    --button-bg-hover: var(--color-surface-control-hover);
    --button-text: var(--color-text-primary);
    --button-border: var(--color-border);
    --button-border-hover: var(--color-border-hover);
    --button-height: 1.75rem;
    --button-width: auto;
    --button-radius: calc(var(--button-height) / var(--control-corner-ratio));
    --button-padding-inline: var(--space-3);
    --button-padding-block: 0rem;
    --button-gap: var(--space-2);
    --button-font-size: var(--text-xs);
    --button-font-family: var(--font-ui);
    --button-font-weight: 400;
    --button-justify: center;
    --button-flex-shrink: 1;
    --button-shadow: 0 0 3px color-mix(in srgb, var(--color-shadow-ink) 40%, transparent);
    /* -- end exposed -- */

    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    flex-shrink: var(--button-flex-shrink);
    align-items: center;
    justify-content: var(--button-justify);
    pointer-events: auto;
    gap: var(--button-gap);
    min-height: var(--button-height);
    width: var(--button-width);
    padding: var(--button-padding-block) var(--button-padding-inline);
    border: 1px solid var(--button-border);
    border-radius: var(--button-radius);
    box-shadow: var(--button-shadow);
    background: var(--button-bg);
    color: var(--button-text);
    font-family: var(--button-font-family);
    font-size: var(--button-font-size);
    font-weight: var(--button-font-weight);
    line-height: 1.1;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease,
      color 150ms ease,
      opacity 150ms ease;
  }

  .button:hover:not(:disabled) {
    background: var(--button-bg-hover);
    border-color: var(--button-border-hover);
  }

  .button:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .button--primary {
    --button-bg: var(--color-accent);
    --button-bg-hover: var(--color-accent-hover);
    --button-text: var(--color-accent-contrast);
    --button-border: var(--color-accent);
    --button-border-hover: var(--color-accent-hover);
  }

  .button--prominent {
    --button-bg: var(--color-accent-muted);
    --button-bg-hover: var(--color-accent-muted-hover);
    --button-text: var(--color-accent-muted-contrast);
    --button-border: var(--color-accent-muted);
    --button-border-hover: var(--color-accent-muted-hover);
  }

  .button--list {
    --button-bg: transparent;
    --button-bg-hover: var(--color-surface-control-hover);
    --button-border: transparent;
    --button-border-hover: transparent;
    --button-height: auto;
    --button-width: 100%;
    --button-padding-inline: var(--space-2);
    --button-padding-block: var(--space-1);
    --button-font-size: var(--text-sm);
    --button-font-family: var(--font-readable);
    --button-justify: flex-start;
    --button-shadow: none;
  }

  .button.is-active {
    --button-bg: var(--color-accent);
    --button-bg-hover: var(--color-accent-hover);
    --button-text: var(--color-accent-contrast);
    --button-border: var(--color-accent);
  }

  /* The resting accent blue is too close to the prominent variant's muted
     slate; active prominent toggles go a step darker to read unambiguously. */
  .button--prominent.is-active {
    --button-bg: var(--color-accent-hover);
    --button-bg-hover: var(--color-accent-hover);
    --button-border: var(--color-accent-hover);
    --button-border-hover: var(--color-accent-hover);
  }

  .button--icon-only {
    --button-padding-inline: 0rem;
    width: var(--button-height);
    padding: 0;
    gap: 0;
  }
</style>
