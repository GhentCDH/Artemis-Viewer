// App-side localisation. One typed dictionary per locale (en.ts / nl.ts);
// `t()` reads the current locale rune, so any template that calls it
// re-renders when the language changes — no reload needed.
import { en, type Dictionary } from './en';
import { nl } from './nl';

const dictionaries = { en, nl } satisfies Record<string, Dictionary>;

export type Locale = keyof typeof dictionaries;

/** Order shown in the language switcher; Dutch first for the primary audience. */
export const LOCALES: Locale[] = ['nl', 'en'];

/** Native-language names, locale-independent by design. */
export const LOCALE_NAMES: Record<Locale, string> = { nl: 'Nederlands', en: 'English' };

/** Compact labels for language toggle buttons. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = { nl: 'NL', en: 'EN' };

const STORAGE_KEY = 'artemis.locale.v1';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in dictionaries;
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'nl';
  // ?lang= beats the stored preference so shared/embedded links can pin a language.
  const fromQuery = new URLSearchParams(window.location.search).get('lang');
  if (isLocale(fromQuery)) return fromQuery;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

let current = $state<Locale>(detectLocale());

export const i18n = {
  get locale(): Locale {
    return current;
  },
  setLocale(next: Locale): void {
    if (current === next) return;
    current = next;
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  },
};

/** Reactive dictionary accessor: `{t().branding.team}` in a template tracks the locale. */
export function t(): Dictionary {
  return dictionaries[current];
}

/**
 * Fills `{name}` placeholders in a dictionary template:
 * `format(t().basemap.remove, { label })`. Unknown placeholders are left
 * intact so a typo is visible instead of silently swallowed.
 */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/**
 * A dataset value that carries one text per locale (e.g. sublayer `name` /
 * `description` in the generated layers.yaml). Plain strings are accepted so
 * data generated before the localisation change keeps rendering.
 */
export type LocalizedText = string | { nl?: string; en?: string };

/**
 * Picks the active locale's text from a dataset value, falling back to
 * English, then Dutch. Reads the locale rune, so calls inside templates
 * re-render on language switch. Returns '' for absent values, never an
 * object — guard against rendering `[object Object]`.
 */
export function localize(value: LocalizedText | null | undefined, locale: Locale = i18n.locale): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  return (value[locale] ?? value.en ?? value.nl ?? '').trim();
}

/** Splits a multi-paragraph dictionary text (blank-line separated) for rendering. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export type { Dictionary, TeamRole } from './en';
