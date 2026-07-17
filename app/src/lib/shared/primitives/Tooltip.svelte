<script lang="ts">
  import { tooltip } from './tooltipState.svelte';

  const VIEWPORT_MARGIN = 4;

  let element = $state<HTMLElement | null>(null);
  let shift = $state(0);
  let flipped = $state(false);

  // Callers anchor the tooltip to their control and pick a preferred side; the tooltip
  // itself is responsible for staying inside the viewport. Runs post-render so the
  // rendered box can be measured: shift horizontally to stay in view, flip to the other
  // side when the preferred one would overflow. Neither correction changes the box size,
  // so one measured pass settles it.
  $effect(() => {
    const tip = tooltip.content;
    if (!tip || !element) {
      shift = 0;
      flipped = false;
      return;
    }
    const { offsetWidth: width, offsetHeight: height } = element;
    const desiredLeft = tip.x - width / 2;
    const clampedLeft = Math.min(Math.max(desiredLeft, VIEWPORT_MARGIN), window.innerWidth - VIEWPORT_MARGIN - width);
    shift = clampedLeft - desiredLeft;
    flipped =
      tip.placement === 'above'
        ? tip.y - height < VIEWPORT_MARGIN
        : tip.y + height > window.innerHeight - VIEWPORT_MARGIN;
  });

  const placement = $derived.by(() => {
    const preferred = tooltip.content?.placement ?? 'below';
    if (!flipped) return preferred;
    return preferred === 'above' ? 'below' : 'above';
  });
</script>

{#if tooltip.content}
  {@const tip = tooltip.content}
  <div
    bind:this={element}
    role="tooltip"
    class="tooltip"
    class:tooltip--above={placement === 'above'}
    class:tooltip--below={placement === 'below'}
    style="left: {tip.x}px; top: {tip.y}px; --tooltip-shift: {shift}px;"
  >
    {tip.text}
  </div>
{/if}

<style>
  .tooltip {
    /* -- exposed -- */
    --tooltip-bg: var(--color-surface-raised);
    --tooltip-border: var(--color-border);
    --tooltip-text: var(--color-text-primary);
    --tooltip-gap: var(--space-1);
    /* -- end exposed -- */

    position: fixed;
    left: 0;
    top: 0;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--tooltip-border);
    border-radius: var(--radius-sm);
    background: var(--tooltip-bg);
    color: var(--tooltip-text);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    white-space: nowrap;
    pointer-events: none;
    z-index: var(--z-popover);
  }

  .tooltip--above {
    transform: translate(calc(-50% + var(--tooltip-shift, 0px)), calc(-100% - var(--tooltip-gap)));
  }

  .tooltip--below {
    transform: translate(calc(-50% + var(--tooltip-shift, 0px)), var(--tooltip-gap));
  }
</style>
