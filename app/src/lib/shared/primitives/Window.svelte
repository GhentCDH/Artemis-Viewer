<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    variant?: 'floating' | 'docked' | 'modal' | 'popover' | 'timeline';
    placement?: 'left' | 'right' | 'bottom' | 'center' | 'anchored';
    backdrop?: boolean;
    showClose?: boolean;
    closeLabel?: string;
    closeOnEscape?: boolean;
    closeOnPointerDistance?: number;
    class?: string;
    style?: string;
    onclose?: () => void;
    header?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    title = '',
    subtitle = '',
    variant = 'floating',
    placement = 'left',
    backdrop = false,
    showClose = false,
    closeLabel = 'Close',
    closeOnEscape = false,
    closeOnPointerDistance = 0,
    class: className = '',
    style = '',
    onclose,
    header,
    actions,
    children,
  }: Props = $props();

  let windowElement: HTMLElement | undefined;

  function close() {
    onclose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (closeOnEscape && event.key === 'Escape') {
      close();
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!closeOnPointerDistance || !windowElement) return;

    const rect = windowElement.getBoundingClientRect();
    const horizontalDistance = event.clientX < rect.left
      ? rect.left - event.clientX
      : event.clientX > rect.right
        ? event.clientX - rect.right
        : 0;
    const verticalDistance = event.clientY < rect.top
      ? rect.top - event.clientY
      : event.clientY > rect.bottom
        ? event.clientY - rect.bottom
        : 0;

    if (Math.hypot(horizontalDistance, verticalDistance) > closeOnPointerDistance) {
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onpointermove={handlePointerMove} />

{#if backdrop}
  <Button
    aria-label={closeLabel}
    onclick={close}
    style="position:fixed;inset:0;z-index:var(--z-window-backdrop);margin:0;border:0;border-radius:0;padding:0;min-height:0;background:var(--color-overlay-backdrop);cursor:default;"
  />
{/if}

<section bind:this={windowElement} {style} class={`window window--${variant} window--${placement} ${className}`}>
  {#if title || subtitle || showClose || actions || header}
    <header class="window-header">
      {#if header}
        {@render header()}
      {:else}
        <div class="window-heading">
          {#if title}
            <h2>{title}</h2>
          {/if}
          {#if subtitle}
            <p>{subtitle}</p>
          {/if}
        </div>
      {/if}
      {#if actions || showClose}
        <div class="window-actions">
          {@render actions?.()}
          {#if showClose}
            <Button iconOnly aria-label={closeLabel} onclick={close}>×</Button>
          {/if}
        </div>
      {/if}
    </header>
  {/if}

  <div class="window-body">
    {@render children?.()}
  </div>
</section>

<style>
  .window {
    /* -- exposed -- */
    --window-bg: var(--color-surface-raised);
    --window-header-bg: var(--color-surface-raised);
    --window-border: var(--color-border);
    --window-header-border-width: 1px;
    --window-radius: var(--radius-lg);
    --window-shadow:
      0 1px 3px color-mix(in srgb, var(--color-shadow-ink) 12%, transparent),
      0 8px 18px color-mix(in srgb, var(--color-shadow-ink) 10%, transparent);
    --window-padding-block: var(--space-3);
    --window-padding-inline: var(--space-4);
    --window-gap: var(--space-2);
    --window-width: auto;
    --window-height: auto;
    --window-max-height: none;
    /* -- end exposed -- */

    position: relative;
    z-index: var(--z-window);
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    overflow: hidden;
    width: var(--window-width);
    height: var(--window-height);
    max-height: var(--window-max-height);
    background: var(--window-bg);
    border: 1px solid var(--window-border);
    border-radius: var(--window-radius);
    box-shadow: var(--window-shadow);
    color: var(--color-text-primary);
    font-family: var(--font-ui);
  }

  .window--modal {
    --window-bg: color-mix(in srgb, var(--color-surface-raised) 96%, var(--color-surface-tint));
  }

  .window--popover {
    --window-bg: color-mix(in srgb, var(--color-surface-raised) 98%, var(--color-surface-tint));
    z-index: var(--z-popover);
  }

  .window-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--window-gap);
    padding: var(--window-padding-block) var(--window-padding-inline);
    border-bottom: var(--window-header-border-width) solid var(--window-border);
    background: var(--window-header-bg);
    flex: 0 0 auto;
  }

  .window-heading {
    min-width: 0;
  }

  .window-heading h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.2;
  }

  .window-heading p {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    line-height: 1.3;
  }

  .window-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 0 0 auto;
  }

  .window-body {
    position: relative;
    min-height: 0;
    flex: 1 1 auto;
  }
</style>
