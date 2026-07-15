// MapLibre paint properties need concrete values, not CSS vars — keep the bridge centralized here.
export function readThemeColor(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

export function readThemeNumber(varName: string, fallback: number): number {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
  );
  return Number.isFinite(value) ? value : fallback;
}
