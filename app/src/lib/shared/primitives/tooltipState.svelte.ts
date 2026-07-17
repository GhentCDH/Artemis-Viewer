export interface TooltipContent {
  text: string;
  x: number;
  y: number;
  placement: 'above' | 'below';
}

class TooltipStore {
  content = $state<TooltipContent | null>(null);
}

export const tooltip = new TooltipStore();

export function showTooltip(next: TooltipContent): void {
  tooltip.content = next;
}

export function hideTooltip(): void {
  tooltip.content = null;
}
