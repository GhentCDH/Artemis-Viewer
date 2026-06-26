<!-- Reusable tooltip component that follows cursor -->
<script lang="ts">
  export let content: string = '';
  export let disabled = false;

  let triggerEl: HTMLElement | null = null;
  let tooltipVisible = false;
  let tooltipStyle = '';

  function onMouseMove(event: MouseEvent) {
    if (disabled || !tooltipVisible) return;
    const offset = 12;
    tooltipStyle = `left:${event.clientX + offset}px;top:${event.clientY + offset}px`;
  }

  function onMouseEnter() {
    if (disabled) return;
    tooltipVisible = true;
  }

  function onMouseLeave() {
    tooltipVisible = false;
  }
</script>

<div
  bind:this={triggerEl}
  class="tooltip-trigger"
  on:mouseenter={onMouseEnter}
  on:mouseleave={onMouseLeave}
  on:mousemove={onMouseMove}
  role="region"
  aria-label={content}
>
  <slot />
</div>

{#if tooltipVisible && content}
  <div class="ui-tooltip" style={tooltipStyle} aria-hidden="true">
    {content}
  </div>
{/if}

<style>
  .tooltip-trigger {
    display: contents;
  }
</style>
