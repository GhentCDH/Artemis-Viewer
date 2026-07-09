import type { LayerSummary } from '$lib/core/dataset/layerRegistry';

export interface AxisRange {
  startYear: number;
  endYear: number;
}

const AXIS_PADDING_YEARS = 20;
const AXIS_TICK_INTERVAL_YEARS = 50;

export const DEFAULT_AXIS_RANGE: AxisRange = {
  startYear: 0,
  endYear: AXIS_TICK_INTERVAL_YEARS,
};

export function computeAxisRange(layers: LayerSummary[]): AxisRange {
  const startYears = layers.map((layer) => layer.startYear).filter(Number.isFinite);
  const endYears = layers.map((layer) => layer.endYear).filter(Number.isFinite);

  if (startYears.length === 0 || endYears.length === 0) {
    return DEFAULT_AXIS_RANGE;
  }

  return {
    startYear: Math.min(...startYears) - AXIS_PADDING_YEARS,
    endYear: Math.max(...endYears) + AXIS_PADDING_YEARS,
  };
}

export function yearToPercent(year: number, range: AxisRange): number {
  if (range.endYear <= range.startYear) {
    return 0;
  }

  return ((year - range.startYear) / (range.endYear - range.startYear)) * 100;
}

export function getAxisTicks(range: AxisRange): number[] {
  const ticks: number[] = [];
  const firstTick = Math.ceil(range.startYear / AXIS_TICK_INTERVAL_YEARS) * AXIS_TICK_INTERVAL_YEARS;
  for (let year = firstTick; year <= range.endYear; year += AXIS_TICK_INTERVAL_YEARS) {
    ticks.push(year);
  }
  return ticks;
}
