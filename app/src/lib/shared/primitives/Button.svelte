<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'style'> {
    variant?: 'default' | 'primary';
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
    --button-radius: calc(var(--button-height) / var(--control-corner-ratio));
    --button-padding-inline: var(--space-3);
    --button-gap: var(--space-2);
    --button-font-size: var(--text-xs);
    /* -- end exposed -- */

    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    gap: var(--button-gap);
    min-height: var(--button-height);
    padding-inline: var(--button-padding-inline);
    border: 1px solid var(--button-border);
    border-radius: var(--button-radius);
    background: var(--button-bg);
    color: var(--button-text);
    font-family: var(--font-ui);
    font-size: var(--button-font-size);
    font-weight: 400;
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

  .button.is-active {
    --button-bg: var(--color-accent);
    --button-bg-hover: var(--color-accent-hover);
    --button-text: var(--color-accent-contrast);
    --button-border: var(--color-accent);
  }

  .button--icon-only {
    --button-padding-inline: 0rem;
    width: var(--button-height);
    padding: 0;
    gap: 0;
  }
</style>
