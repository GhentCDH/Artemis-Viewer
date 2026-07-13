import type { ImageResult } from '$lib/features/search/searchTypes';

/**
 * Shared image-browser state: the panel's open flag doubles as pin visibility, and
 * `preview` is the single source of truth for the map-anchored preview bubble.
 * A store (not component state) because search opens the panel/bubble from outside
 * the images feature, and the flags must survive the browser unmounting while the
 * document viewer is open (the restore-after-viewer behavior).
 */
class ImageBrowserStore {
  panelOpen = $state(false);
  preview = $state<ImageResult | null>(null);

  setPanelOpen(open: boolean): void {
    this.panelOpen = open;
    // Pins hide with the panel; a bubble anchored to a hidden pin would be orphaned.
    if (!open) this.preview = null;
  }

  /** Opens the preview bubble for an image, and the panel so its pin is visible. */
  showPreview(image: ImageResult): void {
    if (image.lon === null || image.lat === null) return;
    this.panelOpen = true;
    this.preview = image;
  }

  closePreview(): void {
    this.preview = null;
  }
}

export const imageBrowser = new ImageBrowserStore();
