<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'aria-checked' | 'class' | 'role' | 'style' | 'type'> {
    checked?: boolean;
    label: string;
    class?: string;
    style?: string;
  }

  let {
    checked = false,
    label,
    class: className = '',
    style = '',
    ...rest
  }: Props = $props();
</script>

<button
  {...rest}
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {style}
  class={`toggle ${checked ? 'is-checked' : ''} ${className}`}
>
  <span class="toggle-track" aria-hidden="true">
    <span class="toggle-thumb"></span>
  </span>
</button>

<style>
  .toggle {
    /* -- exposed -- */
    --toggle-width: 2rem;
    --toggle-height: 1.125rem;
    --toggle-padding: 0.125rem;
    --toggle-track-bg: color-mix(in srgb, var(--color-surface-control-hover) 74%, var(--color-surface-tint));
    --toggle-track-bg-checked: var(--color-accent);
    --toggle-thumb-bg: var(--color-surface-tint);
    --toggle-thumb-bg-checked: var(--toggle-thumb-bg);
    --toggle-border: var(--color-border);
    --toggle-border-width: 1px;
    /* -- end exposed -- */

    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--toggle-width);
    height: var(--toggle-height);
    margin: 0;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }

  .toggle:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 1px;
  }

  .toggle-track {
    position: relative;
    width: var(--toggle-width);
    height: var(--toggle-height);
    border: var(--toggle-border-width) solid var(--toggle-border);
    border-radius: var(--radius-pill);
    background: var(--toggle-track-bg);
    box-shadow: inset 0 1px 2px color-mix(in srgb, var(--color-shadow-ink) 10%, transparent);
    transition:
      background 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .toggle-thumb {
    position: absolute;
    top: var(--toggle-padding);
    left: var(--toggle-padding);
    width: calc(var(--toggle-height) - var(--toggle-padding) * 2 - var(--toggle-border-width) * 2);
    height: calc(var(--toggle-height) - var(--toggle-padding) * 2 - var(--toggle-border-width) * 2);
    border-radius: var(--radius-pill);
    background: var(--toggle-thumb-bg);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--color-shadow-ink) 20%, transparent),
      0 0 0 1px color-mix(in srgb, var(--color-shadow-ink) 6%, transparent);
    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .toggle.is-checked .toggle-track {
    --toggle-border: var(--color-accent);

    background: var(--toggle-track-bg-checked);
    box-shadow: inset 0 1px 2px color-mix(in srgb, var(--color-shadow-ink) 14%, transparent);
  }

  .toggle.is-checked .toggle-thumb {
    background: var(--toggle-thumb-bg-checked);
    transform: translateX(calc(var(--toggle-width) - var(--toggle-height)));
  }
</style>
