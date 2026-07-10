<script lang="ts">
  import { tooltipStore } from '../tooltip.svelte';
</script>

{#if tooltipStore.content}
  {@const tip = tooltipStore.content}
  <div
    class="tooltip"
    class:tooltip--above={tip.placement === 'above'}
    class:tooltip--below={tip.placement === 'below'}
    style="left: {tip.x}px; top: {tip.y}px;"
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
    transform: translate(-50%, calc(-100% - var(--tooltip-gap)));
  }

  .tooltip--below {
    transform: translate(-50%, var(--tooltip-gap));
  }
</style>
