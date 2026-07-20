<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';
  import { t } from '$lib/shared/i18n/i18nStore.svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    variant?: 'floating' | 'docked' | 'modal' | 'popover' | 'timeline';
    placement?: 'left' | 'right' | 'bottom' | 'center' | 'anchored';
    backdrop?: boolean;
    showClose?: boolean;
    closeLabel?: string;
    closeOnEscape?: boolean;
    closeOnPointerEnter?: HTMLElement | null;
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
    closeLabel = undefined,
    closeOnEscape = false,
    closeOnPointerEnter = null,
    class: className = '',
    style = '',
    onclose,
    header,
    actions,
    children,
  }: Props = $props();

  let windowElement: HTMLElement | undefined;
  /* A straight-line path from the trigger to this window can graze the target
     element for a frame or two (e.g. crossing the gap between two panels) without
     the user meaning to enter it. Require the pointer to stay put briefly before
     treating it as a real entry. */
  const POINTER_ENTER_CLOSE_DELAY = 350;
  let pointerEnterTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPointerEnterTimer() {
    if (pointerEnterTimer === null) return;
    clearTimeout(pointerEnterTimer);
    pointerEnterTimer = null;
  }

  $effect(() => () => clearPointerEnterTimer());

  function close() {
    onclose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (closeOnEscape && event.key === 'Escape') {
      close();
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!closeOnPointerEnter) return;

    const withinTarget = event.target instanceof Node && closeOnPointerEnter.contains(event.target);
    if (!withinTarget) {
      clearPointerEnterTimer();
      return;
    }

    if (pointerEnterTimer === null) {
      pointerEnterTimer = setTimeout(() => {
        pointerEnterTimer = null;
        close();
      }, POINTER_ENTER_CLOSE_DELAY);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onpointermove={handlePointerMove} />

{#if backdrop}
  <Button
    aria-label={closeLabel ?? t().window.close}
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
            <Button iconOnly aria-label={closeLabel ?? t().window.close} onclick={close}>×</Button>
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
      0 0 3px color-mix(in srgb, var(--color-shadow-ink) 22%, transparent),
      0 0 18px color-mix(in srgb, var(--color-shadow-ink) 20%, transparent);
    --window-padding-block: var(--space-3);
    --window-padding-inline: var(--space-4);
    --window-gap: var(--space-2);
    --window-width: auto;
    --window-height: auto;
    --window-max-height: none;
    --window-pointer-events: auto;
    /* -- end exposed -- */

    position: relative;
    z-index: var(--z-window);
    display: flex;
    flex-direction: column;
    pointer-events: var(--window-pointer-events);
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

  .window :global(.button) {
    --button-shadow: none;
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
