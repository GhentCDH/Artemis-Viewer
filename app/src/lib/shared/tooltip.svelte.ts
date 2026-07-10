export interface TooltipContent {
  text: string;
  x: number;
  y: number;
  placement: 'above' | 'below';
}

class TooltipStore {
  content = $state<TooltipContent | null>(null);
}

export const tooltipStore = new TooltipStore();

export function showTooltip(next: TooltipContent): void {
  tooltipStore.content = next;
}

export function hideTooltip(): void {
  tooltipStore.content = null;
}
