import type maplibregl from 'maplibre-gl';
import type { LngLat } from 'maplibre-gl';

// PNG export of the workspace without UI chrome: only canvases are composited, so DOM
// overlays (windows, timeline, tooltips) are excluded by construction while everything
// drawn into a map or viewer canvas (warped sheets, pins, mask outlines) is included.
//
// Capture-timing contract (2 parts, spread over 2 files — breaking either yields blank
// or partial exports with no error):
// 1. each map canvas is read inside its own `render` event after `triggerRepaint()`,
//    before WebGL could clear the buffer (this file). This is what lets the maps run
//    WITHOUT preserveDrawingBuffer (a per-frame GPU cost — see core/map/maplibreInit.ts);
//    reading a map canvas at any other moment yields an empty buffer.
// 2. `crossOriginPolicy: 'Anonymous'` on the OpenSeadragon viewer keeps its canvases
//    untainted (features/viewer/IiifViewer.svelte).

export interface ScreenshotSources {
  /** Element whose box defines the export frame; canvas positions are taken relative to it. */
  stage: HTMLElement;
  maps: maplibregl.Map[];
  /** Root element of an open document viewer; every canvas inside it is composited on top of the maps. */
  viewerHost?: HTMLElement | null;
  /** Branding lockup to render as a fixed-size bottom-left watermark. */
  watermark?: HTMLElement | null;
}

export interface ScreenshotFilenameParts {
  center?: LngLat;
  layerLabels: string[];
  documentTitle?: string;
}

function sanitizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
}

export function buildScreenshotFilename({ center, layerLabels, documentTitle }: ScreenshotFilenameParts): string {
  const parts = ['Artemis'];
  if (center) {
    parts.push(`${Math.abs(center.lat).toFixed(4)}${center.lat < 0 ? 'S' : 'N'}`);
    parts.push(`${Math.abs(center.lng).toFixed(4)}${center.lng < 0 ? 'W' : 'E'}`);
  }
  const labels = layerLabels.map(sanitizeLabel).filter((label) => label.length > 0);
  parts.push(labels.length > 0 ? labels.join('-') : 'no-layers');
  if (documentTitle) {
    const title = sanitizeLabel(documentTitle);
    if (title.length > 0) parts.push(title);
  }
  return `${parts.join('_')}.png`;
}

/** A cross-origin-tainted canvas would poison the whole export at `toBlob`; probe each source first and skip the tainted ones. */
function isReadable(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext('2d');
  if (!context) return false;
  try {
    context.drawImage(canvas, 0, 0, 1, 1);
    context.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function waitForRenderFrame(map: maplibregl.Map, onRender: () => void): Promise<void> {
  return new Promise((resolve) => {
    map.once('render', () => {
      onRender();
      resolve();
    });
    map.triggerRepaint();
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function cloneWithComputedStyles(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  const sources = [element, ...element.querySelectorAll<HTMLElement>('*')];
  const clones = [clone, ...clone.querySelectorAll<HTMLElement>('*')];

  for (let index = 0; index < sources.length; index += 1) {
    const computed = getComputedStyle(sources[index]);
    const target = clones[index];
    for (const property of computed) {
      target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
    }
  }

  return clone;
}

async function renderElement(element: HTMLElement): Promise<HTMLImageElement> {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width === 0 || height === 0) throw new Error('Screenshot watermark has no size');

  const clone = cloneWithComputedStyles(element);
  clone.style.margin = '0';
  clone.style.transform = 'none';
  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function captureViewScreenshot(
  { stage, maps, viewerHost, watermark }: ScreenshotSources,
  filename: string
): Promise<void> {
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width === 0 || stageRect.height === 0) throw new Error('Screenshot stage has no size');

  // True device-pixel ratio from a map canvas's backing store, robust against browser
  // zoom; `window.devicePixelRatio` is the fallback when only a viewer is on screen.
  const firstMapCanvas = maps[0]?.getCanvas();
  const dpr =
    firstMapCanvas && firstMapCanvas.getBoundingClientRect().width > 0
      ? firstMapCanvas.width / firstMapCanvas.getBoundingClientRect().width
      : window.devicePixelRatio;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = Math.round(stageRect.width * dpr);
  exportCanvas.height = Math.round(stageRect.height * dpr);
  const maybeContext = exportCanvas.getContext('2d');
  if (!maybeContext) throw new Error('Could not create export canvas context');
  const context: CanvasRenderingContext2D = maybeContext;

  // Base fill so regions no canvas covers (viewer chrome, loading states) export as the
  // workspace surface instead of transparency. Stage children (map panes, viewer) all
  // share that surface background; read it live rather than duplicating the theme token.
  const surface = stage.firstElementChild ? getComputedStyle(stage.firstElementChild).backgroundColor : '';
  if (surface) {
    context.fillStyle = surface;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  function drawCanvas(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || canvas.width === 0 || canvas.height === 0) return;
    if (!isReadable(canvas)) return;
    context.drawImage(
      canvas,
      (rect.left - stageRect.left) * dpr,
      (rect.top - stageRect.top) * dpr,
      rect.width * dpr,
      rect.height * dpr
    );
  }

  await Promise.all(maps.map((map) => waitForRenderFrame(map, () => drawCanvas(map.getCanvas()))));

  if (viewerHost) {
    // OpenSeadragon canvases are transparent; back the viewer area with its own computed
    // background first so the export matches what's on screen.
    const hostRect = viewerHost.getBoundingClientRect();
    const hostBackground = getComputedStyle(viewerHost).backgroundColor;
    if (hostRect.width > 0 && hostRect.height > 0 && hostBackground) {
      context.fillStyle = hostBackground;
      context.fillRect(
        (hostRect.left - stageRect.left) * dpr,
        (hostRect.top - stageRect.top) * dpr,
        hostRect.width * dpr,
        hostRect.height * dpr
      );
    }
    for (const canvas of viewerHost.querySelectorAll('canvas')) {
      drawCanvas(canvas);
    }
  }

  if (watermark) {
    const image = await renderElement(watermark);
    const rect = watermark.getBoundingClientRect();
    const scale = rect.width / watermark.offsetWidth;
    const width = watermark.offsetWidth * scale * dpr;
    const height = watermark.offsetHeight * scale * dpr;
    const inset = 16 * dpr;
    context.drawImage(image, inset, exportCanvas.height - height - inset, width, height);
  }

  const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed (canvas too large?)');
  downloadBlob(blob, filename);
}
