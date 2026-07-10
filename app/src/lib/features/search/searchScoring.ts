import type { ScoredResult } from './searchTypes';

const MAX_RESULTS = 100;

// Tiered so a short exact-ish match beats a long merely-containing one; the closeness
// penalty below is what makes that work (dropping it visibly reorders results).
const EXACT_SCORE = 500;
const RAW_EXACT_SCORE = 450;
const PREFIX_SCORE = 300;
const RAW_PREFIX_SCORE = 260;
const CONTAINS_SCORE = 180;
const RAW_CONTAINS_SCORE = 140;

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scoreText(text: string, query: string): number | null {
  const rawQuery = query.toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;

  const rawText = text.toLowerCase();
  const normalizedText = normalizeSearchText(text);

  let base: number | null = null;
  if (normalizedText === normalizedQuery) base = EXACT_SCORE;
  else if (rawText === rawQuery) base = RAW_EXACT_SCORE;
  else if (normalizedText.startsWith(normalizedQuery)) base = PREFIX_SCORE;
  else if (rawText.startsWith(rawQuery)) base = RAW_PREFIX_SCORE;
  else if (normalizedText.includes(normalizedQuery)) base = CONTAINS_SCORE;
  else if (rawText.includes(rawQuery)) base = RAW_CONTAINS_SCORE;
  if (base === null) return null;

  const closenessPenalty = Math.abs(text.length - query.length);
  return base - closenessPenalty;
}

function rank<T>(items: T[], query: string, getText: (item: T) => string): ScoredResult<T>[] {
  const scored: ScoredResult<T>[] = [];
  for (const item of items) {
    const score = scoreText(getText(item), query);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || getText(a.item).localeCompare(getText(b.item)));
  return scored.slice(0, MAX_RESULTS);
}

export function searchByText<T>(items: T[], query: string, getText: (item: T) => string): ScoredResult<T>[] {
  return rank(items, query, getText);
}
