import type { ImageSprite } from '$lib/features/search/searchTypes';

/**
 * CSS background-crop math for showing one sprite-sheet cell inside an element:
 * scale the sheet so the cell fills the element, then use percentage positioning
 * (which maps 0–100% onto the scrollable range, hence the range denominators).
 */
export function spriteBackgroundSize(sprite: ImageSprite): string {
  return `${(sprite.sheetWidth / sprite.width) * 100}% ${(sprite.sheetHeight / sprite.height) * 100}%`;
}

export function spriteBackgroundPosition(sprite: ImageSprite): string {
  const horizontalRange = sprite.sheetWidth - sprite.width;
  const verticalRange = sprite.sheetHeight - sprite.height;
  const x = horizontalRange > 0 ? (sprite.x / horizontalRange) * 100 : 0;
  const y = verticalRange > 0 ? (sprite.y / verticalRange) * 100 : 0;
  return `${x}% ${y}%`;
}
