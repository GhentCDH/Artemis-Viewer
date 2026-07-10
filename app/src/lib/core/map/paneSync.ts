import type maplibregl from 'maplibre-gl';

/**
 * Hard camera lock between two panes: every `move` on one pane is mirrored onto the
 * other via `jumpTo` (no easing, so the mirrored move fires synchronously). The
 * `syncing` guard swallows that synchronous echo so the two panes don't ping-pong.
 */
export function syncPaneCameras(leftMap: maplibregl.Map, rightMap: maplibregl.Map): () => void {
  let syncing = false;

  function mirror(source: maplibregl.Map, target: maplibregl.Map) {
    return () => {
      if (syncing) return;
      syncing = true;
      target.jumpTo({
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
      });
      syncing = false;
    };
  }

  const onLeftMove = mirror(leftMap, rightMap);
  const onRightMove = mirror(rightMap, leftMap);

  leftMap.on('move', onLeftMove);
  rightMap.on('move', onRightMove);

  return () => {
    leftMap.off('move', onLeftMove);
    rightMap.off('move', onRightMove);
  };
}
