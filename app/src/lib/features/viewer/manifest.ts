export interface IiifViewerSource {
  title: string;
  imageServiceUrl: string;
  metadata: IiifMetadataField[];
}

export interface IiifMetadataField {
  label: string;
  value: string;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record['@value'] === 'string') return record['@value'].trim();
  return Object.values(record).map(text).filter(Boolean).join(' ');
}

function id(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return String(record.id ?? record['@id'] ?? '').trim();
}

/** Loose structural shape of an external IIIF Presentation manifest (v2 or v3).
 * Every field is optional and untrusted — values are re-validated at use. */
interface RawIiifResource {
  service?: unknown | unknown[];
  [key: string]: unknown;
}

interface RawIiifCanvas {
  label?: unknown;
  images?: Array<{ resource?: RawIiifResource } | undefined>;
  items?: Array<{ items?: Array<{ body?: RawIiifResource } | undefined> } | undefined>;
  [key: string]: unknown;
}

interface RawIiifManifest {
  label?: unknown;
  metadata?: Array<{ label?: unknown; value?: unknown } | undefined>;
  summary?: unknown;
  description?: unknown;
  provider?: Array<{ label?: unknown } | undefined> | { label?: unknown };
  rights?: unknown;
  license?: unknown;
  requiredStatement?: { label?: unknown; value?: unknown };
  attribution?: unknown;
  sequences?: Array<{ canvases?: RawIiifCanvas[] } | undefined>;
  items?: RawIiifCanvas[];
  [key: string]: unknown;
}

function imageCandidates(manifest: RawIiifManifest): Array<{ canvasId: string; canvasTitle: string; serviceUrl: string; imageId: string }> {
  const v2Canvases = manifest.sequences?.[0]?.canvases;
  const v2 = Array.isArray(v2Canvases)
    ? v2Canvases.map((canvas) => {
        const resource = canvas?.images?.[0]?.resource;
        const service = Array.isArray(resource?.service) ? resource.service[0] : resource?.service;
        return { canvasId: id(canvas), canvasTitle: text(canvas?.label), serviceUrl: id(service) || id(resource), imageId: id(resource) };
      })
    : [];
  const v3 = Array.isArray(manifest.items)
    ? manifest.items.map((canvas) => {
        const body = canvas?.items?.[0]?.items?.[0]?.body;
        const service = Array.isArray(body?.service) ? body.service[0] : body?.service;
        return { canvasId: id(canvas), canvasTitle: text(canvas?.label), serviceUrl: id(service) || id(body), imageId: id(body) };
      })
    : [];
  return [...v2, ...v3].filter((candidate) => candidate.serviceUrl);
}

function metadataFields(manifest: RawIiifManifest, manifestUrl: string): IiifMetadataField[] {
  const fields: IiifMetadataField[] = [];
  const add = (label: string, value: unknown): void => {
    const parsed = text(value);
    if (parsed) fields.push({ label, value: parsed });
  };

  for (const entry of Array.isArray(manifest.metadata) ? manifest.metadata : []) {
    add(text(entry?.label) || 'Metadata', entry?.value);
  }
  add('Summary', manifest.summary ?? manifest.description);
  add('Provider', Array.isArray(manifest.provider) ? manifest.provider.map((provider) => provider?.label) : manifest.provider?.label);
  add('Rights', manifest.rights ?? manifest.license);
  if (manifest.requiredStatement) {
    add(text(manifest.requiredStatement.label) || 'Attribution', manifest.requiredStatement.value);
  } else {
    add('Attribution', manifest.attribution);
  }
  fields.push({ label: 'Manifest', value: id(manifest) || manifestUrl });
  return fields;
}

const sourceByManifest = new Map<string, Promise<IiifViewerSource>>();

async function fetchIiifViewerSource(manifestUrl: string, selectedImageId: string): Promise<IiifViewerSource> {
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Manifest request failed (HTTP ${response.status})`);
  const manifest = (await response.json()) as RawIiifManifest;
  const candidates = imageCandidates(manifest);
  const selected = selectedImageId
    ? candidates.find((candidate) =>
        [candidate.canvasId, candidate.imageId, candidate.serviceUrl].some(
          (candidateId) =>
            Boolean(candidateId) &&
            (candidateId === selectedImageId || candidateId.includes(selectedImageId) || selectedImageId.includes(candidateId))
        )
      )
    : undefined;
  const imageServiceUrl = (selected ?? candidates[0])?.serviceUrl;
  if (!imageServiceUrl) throw new Error('No IIIF image service was found in this manifest');
  return {
    title: selected?.canvasTitle || text(manifest?.label) || 'Historical document',
    imageServiceUrl: imageServiceUrl.replace(/\/$/, ''),
    metadata: metadataFields(manifest, manifestUrl),
  };
}

export function loadIiifViewerSource(manifestUrl: string, selectedImageId = ''): Promise<IiifViewerSource> {
  const cacheKey = `${manifestUrl}\n${selectedImageId}`;
  let pending = sourceByManifest.get(cacheKey);
  if (!pending) {
    pending = fetchIiifViewerSource(manifestUrl, selectedImageId);
    pending.catch(() => sourceByManifest.delete(cacheKey));
    sourceByManifest.set(cacheKey, pending);
  }
  return pending;
}
