// Persistent URL state — hash-based so it works with static hosting.
//
// Format:  #c=lng,lat,z&l=<code>&r=<code>&s=1&v=<manifest-ref>&i=<image-id>&p=l
//
//   c  — camera: lng (4dp), lat (4dp), zoom (1dp)
//   l  — left pane active layer (2-char code, see LAYER_CODE_TO_ID)
//   r  — right pane active layer (2-char code)
//   s  — split mode: "1" if split, omitted if single
//   v  — viewer manifest URL; known prefixes use aliases (for example "pk:"),
//        dataset-relative URLs are prefixed with "~"
//   i  — selected IIIF canvas/image id; "~" values are manifest-relative
//   p  — viewer pane: "l" for left, omitted for right (default)

export const LAYER_CODE_TO_ID: Record<string, string> = {
  hd: 'HanddrawnCollection',
  fr: 'Frickx',
  vi: 'Villaret',
  fe: 'Ferraris',
  pk: 'PrimitiefKadaster',
  va: 'Vandermaelen',
  gk: 'GereduceerdeKadaster',
  po: 'Popp',
  n3: 'NGI1873',
  n4: 'NGI1904',
};

export const LAYER_ID_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LAYER_CODE_TO_ID).map(([code, id]) => [id, code])
);

export const DEFAULT_URL_CENTER = { lng: 4.184, lat: 51.0656, zoom: 8.9 };

const MANIFEST_PREFIX_BY_ALIAS: Record<string, string> = {
  pk: 'https://iiif.ghentcdh.ugent.be/iiif/manifests/primitief_kadaster:',
};

export interface UrlAppState {
  center?: { lng: number; lat: number; zoom: number };
  leftMainId?: string;
  rightMainId?: string;
  viewMode?: 'split';
  viewerManifestUrl?: string;
  viewerImageId?: string;
  viewerPane?: 'left' | 'right';
}

function encodeManifestRef(manifestUrl: string, datasetBaseUrl: string): string {
  for (const [alias, prefix] of Object.entries(MANIFEST_PREFIX_BY_ALIAS)) {
    if (manifestUrl.startsWith(prefix)) return `${alias}:${manifestUrl.slice(prefix.length)}`;
  }

  const base = datasetBaseUrl.replace(/\/$/, '');
  if (base && manifestUrl.startsWith(base + '/')) {
    return '~' + manifestUrl.slice(base.length + 1);
  }
  return manifestUrl;
}

function decodeManifestRef(ref: string, datasetBaseUrl: string): string {
  if (ref.startsWith('~')) {
    const base = datasetBaseUrl.replace(/\/$/, '');
    return base + '/' + ref.slice(1);
  }

  const aliasSeparator = ref.indexOf(':');
  if (aliasSeparator > 0) {
    const alias = ref.slice(0, aliasSeparator);
    if (Object.hasOwn(MANIFEST_PREFIX_BY_ALIAS, alias)) {
      return MANIFEST_PREFIX_BY_ALIAS[alias] + ref.slice(aliasSeparator + 1);
    }
  }

  return ref;
}

function encodeManifestParam(ref: string): string {
  const encoded = encodeURIComponent(ref);
  const alias = ref.slice(0, ref.indexOf(':'));
  return Object.hasOwn(MANIFEST_PREFIX_BY_ALIAS, alias) ? encoded.replace('%3A', ':') : encoded;
}

function identifierLeaf(value: string): string {
  const clean = value.replace(/[?#].*$/, '').replace(/\/$/, '');
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf(':')) + 1);
}

function encodeImageRef(imageId: string, manifestUrl: string): string {
  const imageLeaf = identifierLeaf(imageId);
  const manifestLeaf = identifierLeaf(manifestUrl);
  if (manifestLeaf && imageLeaf.startsWith(manifestLeaf)) {
    return `~${imageLeaf.slice(manifestLeaf.length)}`;
  }
  return imageLeaf && imageLeaf.length < imageId.length ? `!${imageLeaf}` : imageId;
}

function decodeImageRef(ref: string, manifestUrl: string): string {
  if (ref.startsWith('~')) return `${identifierLeaf(manifestUrl)}${ref.slice(1)}`;
  if (ref.startsWith('!')) return ref.slice(1);
  return ref;
}

export function encodeAppState(state: UrlAppState, datasetBaseUrl = ''): string {
  const parts: string[] = [];

  if (state.center) {
    const { lng, lat, zoom } = state.center;
    parts.push(`c=${lng.toFixed(4)},${lat.toFixed(4)},${zoom.toFixed(1)}`);
  }
  if (state.leftMainId) {
    const code = LAYER_ID_TO_CODE[state.leftMainId];
    if (code) parts.push(`l=${code}`);
  }
  if (state.rightMainId) {
    const code = LAYER_ID_TO_CODE[state.rightMainId];
    if (code) parts.push(`r=${code}`);
  }
  if (state.viewMode === 'split') parts.push('s=1');
  if (state.viewerManifestUrl) {
    const ref = encodeManifestRef(state.viewerManifestUrl, datasetBaseUrl);
    parts.push(`v=${encodeManifestParam(ref)}`);
    if (state.viewerImageId) {
      parts.push(`i=${encodeURIComponent(encodeImageRef(state.viewerImageId, state.viewerManifestUrl))}`);
    }
    if (state.viewerPane === 'left') parts.push('p=l');
  }

  return parts.join('&');
}

export function decodeAppState(hash: string, datasetBaseUrl = ''): UrlAppState {
  const paramStr = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!paramStr) return {};

  const params = new URLSearchParams(paramStr);

  let center: UrlAppState['center'];
  const cParam = params.get('c');
  if (cParam) {
    const parts = cParam.split(',');
    const lng = parseFloat(parts[0] ?? '');
    const lat = parseFloat(parts[1] ?? '');
    const zoom = parseFloat(parts[2] ?? '');
    if (
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      Number.isFinite(zoom) &&
      zoom >= 0 &&
      zoom <= 24
    ) {
      center = { lng, lat, zoom };
    }
  }

  const lCode = params.get('l');
  const rCode = params.get('r');
  const vRaw = params.get('v');
  const iRaw = params.get('i');
  const pRaw = params.get('p');

  return {
    center,
    leftMainId: lCode ? LAYER_CODE_TO_ID[lCode] : undefined,
    rightMainId: rCode ? LAYER_CODE_TO_ID[rCode] : undefined,
    viewMode: params.get('s') === '1' ? 'split' : undefined,
    viewerManifestUrl: vRaw ? decodeManifestRef(vRaw, datasetBaseUrl) : undefined,
    viewerImageId: vRaw && iRaw ? decodeImageRef(iRaw, decodeManifestRef(vRaw, datasetBaseUrl)) : undefined,
    viewerPane: pRaw === 'l' ? 'left' : vRaw ? 'right' : undefined,
  };
}
