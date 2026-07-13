export interface SiteLogo {
  src: string;
  alt: string;
  href: string | null;
  label: string;
}

export interface SiteTeamUnit {
  unit: string;
  members: string[];
}

export interface SiteTeamInstitution {
  institution: string;
  units: SiteTeamUnit[];
}

export interface SiteLink {
  label: string;
  url: string;
}

export interface SitePipeline {
  title: string;
  info: string[];
  links: SiteLink[];
}

export interface SiteMetadata {
  title: string;
  info: string[];
  attribution: string;
  pipeline: SitePipeline;
  team: SiteTeamInstitution[];
  logos: SiteLogo[];
}

function emptyPipeline(): SitePipeline {
  return { title: 'Data pipeline', info: [], links: [] };
}

function emptySiteMetadata(): SiteMetadata {
  return { title: 'About Artemis', info: [], attribution: '', pipeline: emptyPipeline(), team: [], logos: [] };
}

async function fetchAboutJson(aboutUrl: string): Promise<unknown> {
  const response = await fetch(aboutUrl);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${aboutUrl}`);
  }
  // GitHub Pages serves index.html (not a 404) for a missing path, so a non-JSON
  // body means "not found" even though the request itself succeeded.
  const trimmed = text.trim().toLowerCase();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    throw new Error(`Expected JSON but got HTML from ${aboutUrl}`);
  }
  return JSON.parse(text);
}

function normalizeParagraphs(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
}

/** `links` in about.json is a map of display label → URL. */
function normalizeLinks(value: unknown): SiteLink[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([label, url]): SiteLink[] => {
    const trimmedLabel = label.trim();
    const trimmedUrl = typeof url === 'string' ? url.trim() : '';
    if (!trimmedLabel || !/^https?:\/\//i.test(trimmedUrl)) return [];
    return [{ label: trimmedLabel, url: trimmedUrl }];
  });
}

function normalizePipeline(value: unknown): SitePipeline {
  if (!value || typeof value !== 'object') return emptyPipeline();
  const record = value as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Data pipeline',
    info: normalizeParagraphs(record.info),
    links: normalizeLinks(record.links)
  };
}

function normalizeTeam(value: unknown): SiteTeamInstitution[] {
  if (!Array.isArray(value)) return [];
  const unitsByInstitution = new Map<string, SiteTeamUnit[]>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const institution = typeof record.institution === 'string' ? record.institution.trim() : '';
    const unit = typeof record.unit === 'string' ? record.unit.trim() : '';
    const members = Array.isArray(record.members)
      ? record.members.map((member) => (typeof member === 'string' ? member.trim() : '')).filter(Boolean)
      : [];
    if (!institution || (!unit && members.length === 0)) continue;

    const units = unitsByInstitution.get(institution) ?? [];
    units.push({ unit, members });
    unitsByInstitution.set(institution, units);
  }

  return [...unitsByInstitution.entries()].map(([institution, units]) => ({ institution, units }));
}

function normalizeLogos(value: unknown, resolveUrl: (path: string) => string): SiteLogo[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): SiteLogo[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const rawSrc = typeof record.src === 'string' ? record.src.trim() : '';
    if (!rawSrc) return [];

    const alt = typeof record.alt === 'string' ? record.alt.trim() : '';
    const href = typeof record.href === 'string' && record.href.trim() ? record.href.trim() : null;
    const label = (typeof record.name === 'string' && record.name.trim()) || alt || rawSrc;
    const src = /^https?:\/\//i.test(rawSrc) ? rawSrc : resolveUrl(rawSrc);

    return [{ src, alt, href, label }];
  });
}

function normalizeSiteMetadata(raw: unknown, resolveUrl: (path: string) => string): SiteMetadata {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'About Artemis',
    info: normalizeParagraphs(data.info),
    attribution: typeof data.attribution === 'string' ? data.attribution.trim() : '',
    pipeline: normalizePipeline(data.dataPipeline),
    team: normalizeTeam(data.team),
    logos: normalizeLogos(data.logos, resolveUrl),
  };
}

/**
 * Loads `about.json` from the dataset repo. `datasetUrl` resolves both the
 * about.json request itself and any relative logo `src` paths it contains,
 * since logo assets live alongside it in the data repo, not the viewer.
 */
export async function loadSiteMetadata(datasetUrl: (path: string) => string): Promise<SiteMetadata> {
  try {
    const raw = await fetchAboutJson(datasetUrl('about.json'));
    return normalizeSiteMetadata(raw, datasetUrl);
  } catch {
    return emptySiteMetadata();
  }
}
