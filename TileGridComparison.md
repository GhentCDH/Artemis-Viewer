# IIIF tile-grid comparison — Primitief Kadaster vs Gereduceerd Kadaster vs Watertijdreis

*2026-07-15. Numbers read live from each image service's `info.json`; tile counts are
`ceil(w / (tile·sf)) × ceil(h / (tile·sf))` summed per scale factor. Zoom levels are a property of
the image service, not the manifest.*

**Sources**

- Primitief Kadaster: `https://iiif.ghentcdh.ugent.be/iiif/collections/primitief_kadaster`
  (327 manifests, 1 canvas each; 5 sampled across the collection)
- Gereduceerd Kadaster: collection JSON at
  `https://raw.githubusercontent.com/RDebrulle/AllmapsTests/refs/heads/main/Gereduceerd_Kadaster.json`,
  images on the same Ghent CDH server (248 manifests, **2 canvases each**; 5 sampled)
- Watertijdreis: manifests in `tu-delft-heritage/watertijdreis-data` under
  `content/iiif-manifests/` (9 editions of the Waterstaatskaart, 152–282 canvases each), images on
  Utrecht University's server
  (`https://objects.library.uu.nl/fcgi-bin/iipsrv.fcgi?IIIF=/manifestation/viewer/…jp2`).
  Sampled: one mid-manifest map sheet from each of 5 editions (01, 03, 05, 07, 09), plus the p1
  index sheet of edition 01 kept as a small-sheet reference.

## Tiles per zoom level

Counts at the advertised 256px grid; the last column is the total at the 512px grid the viewer
actually requests (`ALLMAPS_TILE_SIZE` override in `app/src/lib/core/renderers/iiif/iiifImageInfo.ts`).

### Primitief Kadaster (Ghent CDH — `iiif.ghentcdh.ugent.be`)

| Sheet | Size (px) | Levels | sf1 | sf2 | sf4 | sf8 | sf16 | sf32 | sf64 | Total @256 | Total @512 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sinaai A+B | 11760×7800 | 7 | 1426 | 368 | 96 | 24 | 6 | 2 | 1 | 1923 | 498 |
| Kalken B | 7804×11736 | 7 | 1426 | 368 | 96 | 24 | 6 | 2 | 1 | 1923 | 498 |
| Buggenhout D | 11560×7616 | 7 | 1380 | 345 | 96 | 24 | 6 | 2 | 1 | 1854 | 475 |
| Sint-Kruis-Winkel C | 11715×7420 | 7 | 1334 | 345 | 96 | 24 | 6 | 2 | 1 | 1808 | 475 |
| Puurs verzamelplan | 3542×4179 | 6 | 238 | 63 | 20 | 6 | 2 | 1 | – | 330 | 93 |
| **Average (n=5)** | — | ~7 | **1161** | **298** | **81** | **20** | **5** | **2** | **1** | **1568** | **408** |

### Gereduceerd Kadaster (Ghent CDH — `iiif.ghentcdh.ugent.be`)

Counts are per canvas; every sampled manifest has 2 canvases, so a fully rendered manifest is ~2×
these numbers.

| Sheet | Size (px) | Levels | sf1 | sf2 | sf4 | sf8 | sf16 | sf32 | sf64 | Total @256 | Total @512 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Appels | 11200×7518 | 7 | 1320 | 330 | 88 | 24 | 6 | 2 | 1 | 1771 | 452 |
| Hove | 11200×7449 | 7 | 1320 | 330 | 88 | 24 | 6 | 2 | 1 | 1771 | 452 |
| Gand | 13400×7513 | 7 | 1590 | 405 | 112 | 28 | 8 | 2 | 1 | 2146 | 557 |
| Swynaerde | 11200×7549 | 7 | 1320 | 330 | 88 | 24 | 6 | 2 | 1 | 1771 | 452 |
| Breendonck | 11200×7549 | 7 | 1320 | 330 | 88 | 24 | 6 | 2 | 1 | 1771 | 452 |
| **Average (n=5)** | — | 7 | **1374** | **345** | **93** | **25** | **6** | **2** | **1** | **1846** | **473** |

### Watertijdreis (TU Delft / UU — `objects.library.uu.nl`)

One map sheet sampled from the middle of each of 5 editions; the p1 row is edition 01's index
sheet (bladwijzer), kept as a small-sheet reference and excluded from the average.

| Sheet | Size (px) | Levels | sf1 | sf2 | sf4 | sf8 | sf16 | sf32 | sf64 | Total @256 | Total @512 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1e editie, blad 28.SE | 8237×6571 | 7 | 858 | 221 | 63 | 20 | 6 | 2 | 1 | 1171 | 314 |
| 2e editie, blad 33.W | 8200×6586 | 6 | 858 | 221 | 63 | 20 | 6 | 2 | – | 1170 | 313 |
| 3e editie, blad 32.W | 8187×6616 | 6 | 832 | 208 | 56 | 16 | 4 | 1 | – | 1117 | 286 |
| 4e editie, blad 35.W | 8254×6637 | 7 | 858 | 221 | 63 | 20 | 6 | 2 | 1 | 1171 | 314 |
| 5e editie, blad 28.E | 8230×6653 | 7 | 858 | 221 | 63 | 20 | 6 | 2 | 1 | 1171 | 314 |
| **Average (n=5 map sheets)** | — | 6–7 | **853** | **218** | **62** | **19** | **6** | **2** | **1** | **1160** | **308** |
| *p1 index sheet (1e ed.)* | 5770×6543 | 6 | 598 | 156 | 42 | 12 | 4 | 1 | – | 813 | 217 |

## Platform comparison

| | Primitief Kadaster (Ghent CDH) | Gereduceerd Kadaster (Ghent CDH) | Watertijdreis (UU/TU Delft) |
|---|---|---|---|
| Collection size | 327 manifests × 1 canvas | 248 manifests × 2 canvases (~496 sheets) | 9 editions × 152–282 canvases (1,035 canvases in the 5 sampled editions alone) |
| Typical scan size | ~11,700 × 7,800 px | ~11,200 × 7,500 px (very uniform) | ~8,200 × 6,600 px map sheets (index/title sheets smaller) |
| Pyramid | 7 levels (sf 1–64); small verzamelplannen 6 | 7 levels (sf 1–64) | 6–7 levels (sf64 present on most map sheets) |
| Tiles per sheet @256 | ~1,850–1,900 (full-size sheets) | ~1,770–2,150 | ~1,120–1,170 map sheets; ~800 index sheets |
| Advertised tile size | 256 | 256 | 256 |
| Image API / profile | v2, level1 | v2, level2 | v2, level2, precomputed `sizes`, max 5000×5000 |
| Formats | WebP served but not advertised (see `forceWebpFormat`) | same server as PK | jpg, png, tif, webp advertised |

**Takeaways**

*Load profile*

- Heaviest per sheet: the Ghent collections. A full-size PK/GK sheet has ~1.6× the sf1 tile count
  of a WTR map sheet (~1,330–1,430 vs ~850). All three carry the same 256px, 6–7-level pyramid.
- Heaviest per collection: WTR. 152–282 canvases *per edition* (9 editions) vs PK's 327 and GK's
  ~496 sheets — WTR stresses map-count costs (per-map rebuilds, reveal bursts), the Ghent sets
  stress per-map depth.
- ~74% of every sheet's tiles sit in the sf1 level; the 512px override cuts all counts ~4×
  (PK full sheet: ~1,900 → ~490). Both matter only at high zoom.

*Gotchas*

- GK manifests have **2 canvases** each — a rendered manifest costs ~2× its per-sheet numbers.
- PK advertises level1, GK level2, on the same server — per-collection config, not capability.
  Off-grid 512 requests stay valid either way (`regionByPx` is level1), but re-verify Allmaps'
  size syntax if the server ever enforces level1 strictly. WTR is level2 with a 5000×5000 cap.
- The GK collection JSON lives on GitHub raw (`RDebrulle/AllmapsTests`) — external dependency.
