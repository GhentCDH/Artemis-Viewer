// MapLibre paint properties need concrete colors, not CSS vars — this is the one bridge, not one per call site.
export function readThemeColor(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}
