import type { LayerSummary } from '$lib/core/dataset/layerRegistry';

export type BulgeDirection = 'above' | 'below';
type LaneTier = 'inner' | 'outer';

const MIN_VISUAL_SPAN_YEARS = 15;

// Ported from the legacy Timeslider's hard-coded MEANDER_DIRECTIONS + per-collection lane
// fallback — bulge side is presentation layout, not a fact the data repo carries.
const BULGE_DIRECTION: Record<string, BulgeDirection> = {
  HanddrawnCollection: 'above',
  Frickx: 'below',
  Villaret: 'below',
  Ferraris: 'below',
  PrimitiefKadaster: 'above',
  Vandermaelen: 'below',
  GereduceerdeKadaster: 'above',
  Popp: 'above',
  NGI1873: 'below',
  NGI1904: 'above',
};

const TIER_APEX_PERCENT: Record<LaneTier, number> = {
  outer: 85,
  inner: 55,
};

export interface MeanderPill {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  visualStartYear: number;
  visualEndYear: number;
  direction: BulgeDirection;
  path: string;
  apexY: number;
}

function visualRange(layer: LayerSummary): { start: number; end: number } {
  const center = (layer.startYear + layer.endYear) / 2;
  const span = Math.max(layer.endYear - layer.startYear, MIN_VISUAL_SPAN_YEARS);
  return { start: center - span / 2, end: center + span / 2 };
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function bulgeGeometry(direction: BulgeDirection, apexPercent: number): { path: string; apexY: number } {
  const axisY = direction === 'above' ? 100 : 0;
  const apexY = direction === 'above' ? 100 - apexPercent : apexPercent;
  const path = `M 0 ${axisY} C 25 ${axisY}, 25 ${apexY}, 50 ${apexY} C 75 ${apexY}, 75 ${axisY}, 100 ${axisY}`;
  return { path, apexY };
}

export function layoutMeanders(layers: LayerSummary[]): MeanderPill[] {
  const entries = layers.map((layer) => ({
    layer,
    range: visualRange(layer),
    direction: BULGE_DIRECTION[layer.id] ?? 'above',
  }));

  const tierByLayerId = new Map<string, LaneTier>();
  for (const direction of ['above', 'below'] as const) {
    const innerLaneRanges: Array<{ start: number; end: number }> = [];
    const directionEntries = entries
      .filter((entry) => entry.direction === direction)
      .sort((a, b) => a.range.start - b.range.start);

    for (const entry of directionEntries) {
      const collidesWithInner = innerLaneRanges.some((range) => rangesOverlap(entry.range, range));
      if (collidesWithInner) {
        tierByLayerId.set(entry.layer.id, 'outer');
      } else {
        tierByLayerId.set(entry.layer.id, 'inner');
        innerLaneRanges.push(entry.range);
      }
    }
  }

  return entries.map(({ layer, range, direction }) => {
    const tier = tierByLayerId.get(layer.id) ?? 'inner';
    const { path, apexY } = bulgeGeometry(direction, TIER_APEX_PERCENT[tier]);
    return {
      id: layer.id,
      label: layer.label,
      startYear: layer.startYear,
      endYear: layer.endYear,
      visualStartYear: range.start,
      visualEndYear: range.end,
      direction,
      path,
      apexY,
    };
  });
}
