// English dictionary — the source of truth for the message shape. `nl.ts` is
// typed against `Dictionary`, so a missing or extra key there is a type error.
// Pure data: every entry is a label → text pair (leaves are always strings —
// `satisfies MessageTree` enforces this). Parameterized messages use {name}
// placeholders, filled at the call site with `format()` from i18n.svelte.ts.
// Braces are RESERVED for placeholders: `{...}` must never appear as literal
// text in any message — if a text genuinely needs a brace, reword it.
// Multi-paragraph texts are single strings with blank lines between
// paragraphs, split at render time with `paragraphs()`.

/** Locale files are label → text pairs only: every leaf must be a string. */
export type MessageTree = { readonly [key: string]: string | MessageTree };

export const en = {
  window: {
    close: 'Close',
  },
  controls: {
    compareToggle: 'Toggle compare mode',
    compare: 'Compare',
    exitCompare: 'Exit Compare',
    screenshot: 'Screenshot without UI',
    changeLanguage: 'Change language',
    mapWorkspace: 'Map workspace ({pane})',
    paneLeft: 'left',
    paneRight: 'right',
    zoomLevel: 'Zoom level {level}',
    mapScale: 'Map scale: {distance} in the real world',
  },
  basemap: {
    trigger: 'Choose map layers',
    closeMenu: 'Close map layers menu',
    layerTypeGroup: 'Map layer type',
    backgroundTab: 'Background',
    overlayTab: 'Overlay',
    backgroundTitle: 'Background map',
    overlayTitle: 'Overlay layer',
    addBasemapTitle: 'Add basemap',
    addOverlayTitle: 'Add overlay',
    backgroundsSection: 'Background maps',
    overlaysSection: 'Overlay layers',
    addMapService: 'Add map service…',
    addOverlayService: 'Add overlay service…',
    urlLabel: 'Map service URL',
    urlPlaceholder: 'XYZ, WMTS, WMS, or WFS URL',
    nameLabel: 'Name',
    nameOptional: '(optional)',
    namePlaceholder: 'Uses the server name by default',
    back: 'Back',
    add: 'Add',
    checking: 'Checking…',
    transparency: 'Transparency',
    transparencyAria: 'Overlay transparency',
    remove: 'Remove {label}',
    noClickBehaviour: 'No click behaviour: {warning}',
    noClickBehaviourFor: 'No click behaviour for {label}: {warning}',
    staleQueryWarning: 'Click behaviour was not determined for this saved overlay. Re-add it to check again.',
    featureInfoFailed: 'The feature-info request failed.',
    addFailed: 'Unable to add this map service.',
    closeFeatureInfo: 'Close feature information',
    noFeatureAttributes: 'No feature attributes were returned.',
    errors: {
      invalidUrl: 'Enter a valid HTTP(S) URL.',
      notHttp: 'The tile URL must use HTTP or HTTPS.',
      wmtsNoLayer: 'This looks like WMTS, but the URL has no LAYER parameter. Paste a complete GetTile request URL.',
      wmsNoLayers: 'This looks like WMS, but the URL has no LAYERS parameter. Paste a complete GetMap request URL.',
      wfsNoTypenames: 'This looks like WFS, but the URL has no TYPENAMES parameter. Paste a complete GetFeature request URL.',
      unrecognizedUrl:
        'We could not identify this map URL. XYZ/TMS URLs need the z, x and y tile placeholders; WMTS, WMS, or WFS URLs need SERVICE plus a layer or type-name parameter.',
      tileTimeout: 'The tile server did not respond within 6 seconds.',
      tileNotImage: 'The tile server did not return an image for the test location.',
      wfsHttpStatus: 'The WFS server returned HTTP {status}.',
      wfsNotGeoJson: 'The WFS response is not GeoJSON. Check that the service supports JSON output.',
      wfsTimeout: 'The WFS server did not respond within 6 seconds.',
      wfsBlocked: 'The WFS response could not be loaded. The server may block browser requests or may not provide GeoJSON.',
      capabilitiesHttpStatus: 'Capabilities request returned HTTP {status}.',
      capabilitiesMalformed: 'The service returned malformed capabilities XML.',
      layerNotFound: 'Layer “{layer}” was not found in GetCapabilities.',
      layerNotQueryable: 'Layer “{layer}” is not marked queryable.',
      noGetFeatureInfo: 'The service does not advertise GetFeatureInfo.',
      noSupportedFormat: 'GetFeatureInfo has no JSON, HTML, or plain-text response format.',
      capabilitiesTimeout: 'The capabilities request timed out.',
      capabilitiesBlocked: 'Capabilities could not be loaded; the server may block browser requests.',
      wmtsQueriesUnsupported: 'This viewer does not yet support WMTS feature-info queries.',
      xyzQueriesUnsupported: 'XYZ/TMS tiles do not advertise a standard feature-info operation.',
    },
  },
  search: {
    trigger: 'Search',
    close: 'Close search',
    placeholder: 'Search for a place…',
    inputAria: 'Search toponyms, map sheets, and images',
    tabAll: 'All',
    toponyms: 'Toponyms',
    sheets: 'Sheets',
    images: 'Images',
    activeLayersOnly: 'Active layers only',
    loadingIndex: 'Loading search index…',
    typeToSearch: 'Type to search historical place names, map sheets, and images.',
    noResults: 'No results for “{query}”.',
  },
  images: {
    trigger: 'Landscapes',
    inViewAria: 'Landscapes in view ({count})',
    windowTitle: 'Landscapes in view',
    visibleCount: '{shown} of {total} visible images',
    yearFilterAria: 'Filter images by year',
    yearSanitized: 'Adjusted to {year}: outside range.',
    yearRequiresFourDigits: 'Use 4 digits. Restored to {year}.',
    collections: 'Collections',
    collectionsFiltered: 'Collections ({selected}/{total})',
    collectionFilterAria: 'Filter images by collection',
    collectionInfoShow: 'Show {name} info',
    collectionInfoHide: 'Hide {name} info',
    source: 'Source',
    rightsLink: 'Rights and terms of use',
    from: 'From',
    to: 'To',
    increaseStartYear: 'Increase start year',
    decreaseStartYear: 'Decrease start year',
    increaseEndYear: 'Increase end year',
    decreaseEndYear: 'Decrease end year',
    loading: 'Loading images…',
    noneVisible: 'No images are visible in the current map area.',
    previewOf: 'Preview of {title}',
    previewUnavailable: 'Preview unavailable',
    loadingPreview: 'Loading preview…',
    openInViewer: 'Open in viewer',
  },
  timeline: {
    pillActivate: 'Activate {label} · {startYear}–{endYear}',
    pillDeactivate: 'Deactivate {label} · {startYear}–{endYear}',
  },
  metadataInfo: {
    sources: 'Sources',
    sourcesAria: '{name} sources',
    openSource: 'Open source',
    copySourceLink: 'Copy {name} source link',
    readingList: 'Reading list',
    readingListAria: '{name} reading list',
    copied: 'Copied',
  },
  sublayers: {
    closeMenu: 'Close {layer} sublayer menu',
    menuAria: '{layer} sublayers',
    show: 'Show {name}',
    hide: 'Hide {name}',
    showInfo: 'Show {name} info',
    hideInfo: 'Hide {name} info',
    download: 'Download',
    downloadAria: '{name} download',
    copyDownloadLink: 'Copy {name} download link',
    copied: 'Copied',
  },
  iiifViewer: {
    viewerAria: 'IIIF document viewer',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    copyManifest: 'Copy manifest URL',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    manifestCopied: 'Manifest URL copied',
    manifestCopyFailed: 'Copy manifest URL failed',
    openInAllmaps: 'Open in Allmaps Viewer',
    metadata: 'Metadata',
    metadataAria: 'Manifest metadata',
    closeViewer: 'Close document viewer',
    loadingMetadata: 'Loading metadata…',
    openFailed: 'Unable to open this IIIF document',
  },
  branding: {
    openInfo: 'Open project information',
    closePanel: 'Close panel',
    language: 'Language',
    aboutTab: 'About',
    team: 'Team',
    partners: 'Partners',
    info: `
      Schelde Gemapt brings the rich history of the Scheldt landscape to life through historical maps and advanced digital techniques.

      Over the centuries, the Scheldt valley has been in constant motion. River courses shifted, floodplains were embanked, settlements grew, and infrastructure came and went. This digital journey through time reveals that dynamism and shows how the interplay between people and water shaped the landscape of today.

      Within an interactive map environment, the time dimension is the starting point of your exploration. You navigate through different periods and map layers and compare historical situations with the present-day landscape. By combining maps, switching them on and off and exploring them at different scales, you discover long-term changes in water management, land use and habitation. This makes clear how choices from the past still resonate in contemporary spatial and ecological questions.

      Schelde Gemapt was developed within the Artemis project, a collaboration between Ghent University and the University of Antwerp. Artemis aims to digitally unlock historical map collections in Belgium and enrich them into reusable research data. Using techniques such as computer vision and citizen science, maps are systematically digitised and analysed. The resulting datasets are published according to Linked Open Data principles, making them broadly usable in research, heritage and policy.

      The focus lies on the Scheldt valley between Ghent and Antwerp, a unique and dynamic river landscape where natural processes and human interventions have been intertwined for centuries. Tidal action, sedimentation and intensive land use have shaped an area with an exceptional ecological and historical layering. Schelde Gemapt opens up this layering to a broad audience and makes it available for research and reflection.
    `,
    roles: {
      coordinator: 'coordinator',
      mapDataManagement: 'map and data management',
      publicOutreach: 'public and partner engagement',
      promotor: 'principal investigator',
      coPromotor: 'co-investigator',
      machineLearning: 'machine learning',
      researcher: 'researcher',
    },
    pipeline: {
      title: 'Behind the scenes',
      info: `Schelde Gemapt consists of three parts. Data flows through them in this order:

      1. Zenodo — source data
      Zenodo safely stores the original maps and data.

      2. Artemis-Data — data processing
      Artemis-Data prepares the maps and data for fast online use.

      3. Artemis-Viewer — website
      Artemis-Viewer brings everything together in the interactive website you are using now.

      Together, these three parts turn historical source material into an accessible interactive platform.`,
      dataLinkLabel: 'View Artemis-Data on GitHub',
      viewerLinkLabel: 'View Artemis-Viewer on GitHub',
    },
  },
} satisfies MessageTree;

export type Dictionary = typeof en;
export type TeamRole = keyof typeof en.branding.roles;
