# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Lint and format now cover `tests/`** - `npm run lint` and `npm run format:check` only looked at `admin/src` and `server/src`, so nothing ever checked the test suite — which is how a Prettier violation sat on `main` from the draggable-marker commit until it was noticed by hand. `eslint.config.js` already carried a dedicated `tests/**` block (Vitest globals, `no-explicit-any` relaxed), so the rules were written but never applied; only the script's path list was missing. Verified by reintroducing that exact violation and confirming `npm run lint` now exits 1. Root config files stay out: `vitest.config.ts` is clean but `eslint.config.js` is legitimately CommonJS and trips `no-require-imports`. Dev-only change — not part of the published package.

### Fixed

- **Double-click never produced an address without custom POI sources** - The Nominatim lookup that resolves the basemap's own POIs ran *inside* the loop over enabled custom POI layers, so it inherited that loop's conditions. With no `poiSources` configured, `poiLayers` was empty, the loop body never executed, and a double-click — even landing exactly on a hotel or a shop drawn by the map style — saved bare coordinates with no name and no address. Nominatim covers the basemap and has nothing to do with the custom sources, so it is now queried once per gesture, outside that loop. As a side effect this also stops repeating an identical reverse-geocoding request once per configured source: an app with three custom layers issued three of them for a single double-click, against a service whose usage policy caps clients at 1 request per second.

  The snap threshold is unchanged at `poiSnapRadius` (default 5m) and no configuration option was added. Clicking away from any POI still saves coordinates only — deliberately, since OpenStreetMap answers a reverse-geocoding query with its nearest match at *any* distance (39m for a point in central Milan, 366km in unmapped terrain), so accepting it unconditionally would attach a wildly wrong address.

### Changed

- **`searchNearbyPOIsForSnap()` split into `searchNearbyCustomPOIs()`** - The old function queried Nominatim *and* one custom source, which is what tied the two together above. It now queries the custom source only; the Nominatim call moved to the caller. Internal to the admin bundle — not part of the plugin's public API.

### Added

- **Geocoding follows the admin panel locale** - Nominatim requests now carry the editor's admin locale as `accept-language`, so search results and reverse-geocoded addresses come back in the language the editor is already working in (`Mailand, Italien` for a German panel, `Milano, Italia` for an Italian one, same point). Previously no language was requested at all and Nominatim answered in the local language of the place. Note that `properties.address` is therefore stored in whichever language the editor who saved it was using — it is a human-readable label, not a stable key; the coordinates remain the stable value. Documented in [docs/CONFIGURATION.md](docs/CONFIGURATION.md#geocoding-language).

### Fixed

- **Unreadable addresses saved from Nominatim** - `properties.address` was Nominatim's `display_name` verbatim, which is not a postal address: it concatenates every administrative level the service holds for a place, in the same order for every country. A hotel in Milan was stored as `21 House of Stories - Milano Città Studi, 24, Via Enrico Noë, Buenos Aires - Venezia, Municipio 3, Milano, Rodano, Milano, Lombardia, 20133, Italia` — the POI name repeated in front of its own address, two administrative subdivisions nobody writes on an envelope, and the city three times over.

  Nominatim performs no postal formatting of its own and exposes no formatted-address field, so the string is now composed by the plugin from a whitelist of postal fields only (`street`, `housenumber`, `postcode`, `city`, `state`, `country`), giving `Via Enrico Noë 24, 20133 Milano, Lombardia, Italia`. Administrative subdivisions such as `district`, `county` and `municipality` are excluded because they are not part of an address — not because any particular value is wrong upstream, so the result stays correct against a self-hosted instance or corrected OSM data. The region is dropped when it merely repeats the city (city-states such as Berlin, city-provinces such as New York).

  The field order is deliberately the same for every country: a US address reads `5th Avenue 350`, not `350 5th Avenue`. Rendering an address per local postal convention needs a template set per country and is left to consumers, who have the coordinates and `name` as stable inputs.

  The same applies to search results, where `display_name` had been used as both the name *and* the address of every hit.

### Changed

- **Nominatim response format** - Requests moved from `format=jsonv2` (reverse) and `format=json` (search) to `format=geocodejson`. Of the four formats Nominatim offers, only GeocodeJSON normalises the address keys across countries — `street`/`housenumber`/`city` — where `jsonv2` and `geojson` return the raw OSM tags (`road`, `house_number`) plus the `city|town|village` variance that every consumer would otherwise have to unpick. The same field names are emitted by [Photon](https://github.com/komoot/photon) and Addok, so a different geocoding backend can be substituted without changing how responses are read. `format=geojson` was considered and rejected: its RFC 7946 envelope is of no use here, since the plugin builds its own single `Feature` rather than storing Nominatim's `FeatureCollection`, while its `address` dictionary is the unnormalised one. Self-hosted instances need no change — GeocodeJSON is built in and enabled by default.
- **Dead `namedetails` branch removed** - `queryNominatim()` preferred `namedetails.name` over the plain name, but `namedetails` is only returned with `namedetails=1`, which the plugin never sent. The branch had never executed.

## [1.5.0] - 2026-08-21

### Added

- **Draggable main marker** - The location marker can now be dragged to a new position directly on the map, instead of only being repositioned via search, POI click, or double-click. Dropping the marker snaps to a nearby POI within the configured `poiSnapRadius`, same as double-clicking the map; otherwise only the new coordinates are saved (`inputMethod: "marker_drag"`).

### Fixed

- **Redundant `User-Agent` header on Nominatim requests** - Both geocoding services set a `User-Agent` on their `fetch()` calls, with two values that had drifted apart (one still pinned at a hardcoded `1.0.0`). The header was doing no good and some harm: this code runs in the browser, where Chromium silently drops a `User-Agent` set on `fetch()` ([crbug 571722](https://crbug.com/571722)), and where it _is_ honoured it is not CORS-safelisted — turning every geocoding call into a preflight `OPTIONS` plus the `GET`, against a service whose usage policy caps clients at 1 request per second. That policy asks for "a valid HTTP Referer **or** User-Agent identifying the application", and the browser already sends the CMS origin as `Referer`, so dropping the header keeps the plugin compliant while halving the request count on Firefox and Safari. The reasoning is recorded next to the code, and pinned by tests, so it is not reintroduced.

### Changed

- **maplibre-gl** - Updated from `^6.0.0` to `^6.4.1`. Non-breaking minor/patch releases; no code changes required. The floor was raised in three steps, each for a fix that affects a path this plugin depends on:
  - `6.3.0` - `map.queryRenderedFeatures()` could throw an _"Out of bounds"_ error due to a race condition while tile data was still loading — the plugin calls it on every map click, marker drag, and when snapping to PMTiles POI sources, i.e. exactly while the user is panning and tiles are in flight. 6.3.0 also types the map event emitter (`map.on`/`once`/`listens`), which the plugin's `moveend`/`zoomend`/`mouseenter`/`mouseleave` handlers already satisfy.
  - `6.4.0` - Default draggable markers became keyboard-focusable and movable with the arrow keys, which the main location marker's `draggable` prop now relies on for accessibility.
  - `6.4.1` - Fixed `DOM.sanitize` leaving a second dangerous attribute (e.g. `ontoggle`) behind when removing consecutive attributes from an element.

  Remaining changes in this range (GPU texture leak on `ImageSource`/`VideoSource`/`CanvasSource`, terrain gesture and globe zoom/pan fixes, `fill-extrusion-rounded-corner-distance`, symbol-matching performance) do not touch features used here — the plugin never enables globe projection.
- **pmtiles** - Updated from `^4.4.0` to `^4.5.0`. No API change; 4.5.0 aborts pending directory requests once all dependent tile requests are cancelled, which trims orphaned network traffic when panning quickly over PMTiles POI sources.
- **Service test coverage** - Added 41 tests for `poi-service.ts` and `geocoder-service.ts`, the two modules that were previously untested (suite now 67 tests). They cover the Haversine distance maths, GeoJSON↔POI conversion, the Nominatim radius filter, viewport bounds filtering and distance sorting, the absence of custom request headers described above, and the graceful-degradation paths where a failing POI source must not take the search down with it. Both suites run under `@vitest-environment node` and stub `fetch` with `vi.stubGlobal` — no network access, no DOM, no extra dependency. This was the coverage the Jest→Vitest migration unblocked: neither module could be exercised while `maplibre-gl` was replaced by a hand-written CJS stub. Dev-only change — not part of the published package.
- **Test runner** - Migrated from Jest to Vitest. `maplibre-gl` v6 and `pmtiles` v4 are ESM-only, and ts-jest's CJS transform forced a hand-written `maplibre-gl` stub in `tests/__mocks__/` that stood in for the real module in every suite; Vitest loads ESM natively, so that stub is gone. It also shares Vite's resolver with `strapi-plugin build`, removing the second, differently-behaving module-resolution path — the same class of mismatch behind the worker-loading issues documented in CLAUDE.md. `jest`, `jest-environment-jsdom`, `ts-jest`, `@types/jest`, `identity-obj-proxy` and the now-unused `ts-node` were replaced by `vitest` + `jsdom`. `npm test` runs the same 23 tests; `npm run test:watch` replaces `npm test -- --watch`. `tsconfig.json` gained `module: esnext` / `moduleResolution: bundler` / `esModuleInterop` to match how the code is actually bundled, which also made `tsc --noEmit` pass for the first time. Dev-only change — not part of the published package.
- **ESLint** - Updated from `^8.57.0` to `^10.8.0`. Migrated `.eslintrc.js` to flat config (`eslint.config.js`), required by ESLint 10 (legacy config format was removed with no opt-out). `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` replaced by the unified `typescript-eslint` package. Dev-only change — not part of the published package.
- **jsdom** - Updated from `^29.1.1` to `^30.0.1`. Requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`, already satisfied by the CI matrix (22, 24, 26) and this plugin's `engines.node`. No test changes required. Dev-only change — not part of the published package.
- **react-router-dom (lockfile resolution)** - Bumped the resolved version from `6.30.4` to `6.30.6` within the existing `^6.0.0` peer range, fixing a GitHub-reported open redirect leading to XSS (vulnerable range `>=6.30.2,<=6.30.4`). The declared peer range is unchanged, so apps depending on an older Strapi-bundled `react-router-dom` are unaffected.

## [1.4.1] - 2026-07-30

### Fixed

- **README screenshots not rendering on Strapi Marketplace** - Image links used GitHub `/blob/` URLs, which resolve to an HTML page rather than the raw image outside GitHub's own UI. Switched to `raw.githubusercontent.com`.

## [1.4.0] - 2026-07-30

### Changed

- **Minimum Node.js version raised to 22** - `engines.node` is now `>=22.0.0 <=24.x.x` (was `>=20.0.0`). Node 20 (LTS "Iron") reached end-of-life in April 2026. **Installing on Node 20 will fail** — upgrade Node before upgrading the plugin.
- **maplibre-gl** - Updated from `^5.21.0` to `^6.0.0` (ESM-only); imports switched to namespace form (`import * as maplibregl`). v6 no longer inlines its web worker, so the plugin now points `setWorkerUrl()` at its own same-origin endpoint (see _Added_). **No action required in your app**: neither the `contentSecurityPolicy` settings in `config/middlewares.ts` nor any Vite configuration need to change. The call is version-guarded and is skipped on maplibre-gl v5, which bootstraps its own worker internally.
- **react-map-gl** - Updated from `^8.1.0` to `^8.1.2`. Versions `8.1.0`/`8.1.1` crashed at runtime against maplibre-gl v6 due to an [upstream bug](https://github.com/visgl/react-map-gl/issues/2597) (`map.transform` removed in v6); fixed in `8.1.2`.
- **pmtiles** - Updated from `^4.4.0` to `^4.4.1` (patch release, no API change).
- **Source type label in the layer panel** - The `GEOJSON`/`PMTILES` label now uses a 9px font (was 10px) with wider letter spacing, so it reads as a tag rather than competing with the layer name.
- **Development toolchain** - Updated `@strapi/sdk-plugin`, `typescript`, `@typescript-eslint/*`, `@testing-library/react` (`^14.0.0` → `^16.3.2`) and `@testing-library/jest-dom` (`^6.0.0` → `^7.0.0`, requires Node ≥22). Development dependencies only — no effect on the published bundle.

### Added

- **Same-origin worker endpoint** - The plugin server exposes `GET /maplibre-field/worker/:file`, serving maplibre-gl's `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` from the copy your app has installed. Note for security reviews and reverse-proxy allowlists: the route is **unauthenticated**, because the browser's `Worker` loader cannot send admin credentials. It serves only those two public maplibre-gl files, and no other path.

### Documentation

- **README POI section** - Clarified that POI sources support both GeoJSON URLs (static file or API endpoint) and PMTiles vector tile archives

## [1.3.0] - 2026-04-12

### Added

- **PMTiles POI sources** - `poiSources` now supports `type: 'pmtiles'` in addition to `'geojson'`. PMTiles sources are rendered natively by MapLibre via HTTP range requests — no tile server required. Requires `sourceLayer` to identify the vector layer inside the archive.
- **Source type label in layer legend** - The layer control panel now shows `GEOJSON` or `PMTILES` next to each layer name so editors know what kind of data they are toggling.
- **Improved field layout below map** - Fields below the map use a native CSS flex layout: Address/POI Name (50%) + Longitude (25%) + Latitude (25%) on the first row; Full Address (100%) on a second row when a POI with address is selected.

### Fixed

- **Layer control panel closes on toggle** - Clicking a layer item to show/hide it no longer closes the panel. Root cause was a combination of `document.addEventListener('click')` accumulating across re-renders, an unstable `handleLayerToggle` reference causing the control to be recreated on every toggle, and `stopPropagation()` interfering with MapLibre's event system. Fixed by: registering the outside-click listener once in `onAdd()` using `mousedown` instead of `click`; wrapping `handleLayerToggle` in `useCallback`; removing all `stopPropagation()` calls.

### Changed

- **Field layout uses native flex** - Replaced Strapi `Grid.Root`/`Grid.Item` with a plain `div` flex container to avoid `gridCols` sizing inconsistencies inside the edit view.

## [1.2.2] - 2026-03-20

### Fixed

- **__publicField is not defined** - Unpinned `maplibre-gl` from `5.16.0` now that class field declarations are fixed upstream ([#7283 @maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js/pull/7283)) and compatibility for ES2020 is guaranteed.

## [1.2.1] - 2026-02-22

### Added

- **Full-width map field** - Map field now spans all 12 columns in the edit view layout for better usability
- **Rebalanced info grid** - Place name (6 cols), longitude (3 cols), latitude (3 cols) instead of 8-2-2

### Fixed

- **Admin route security** - Protected `/config` endpoint with `policies: ['admin::isAuthenticatedAdmin']` to allow access to every Strapi authenticated role and prevent unauthorized access
- **Vite/esbuild class field transpilation** - Removed ES2022 class field declarations from `BasemapControl` and `LayerControlImpl` to prevent `__publicField is not defined` runtime error when Strapi's Vite pre-bundles the plugin with esbuild targeting below ES2022
- **MapLibre GL pinned to v5.16.0** - Pinned exact version to avoid `__publicField` runtime error with newer releases that use ES2022 class fields
- **Prettier formatting** - Fixed line length violation in config schema

### Changed

- **Node.js support** - Extended compatibility to Node.js 24.x (>=20.0.0 <=24.x.x)
- **TypeScript** - Updated from ^5.0.0 to ^5.5.0
- **ESLint** - Updated from ^8.0.0 to ^8.57.0
- **PMTiles** - Updated from v4.3.2 to v4.4.0

### Known issue: `__publicField is not defined` in Strapi dev mode

`maplibre-gl` v5 uses ES2022 class field declarations internally (e.g., in the MLT codec). Strapi's Vite dev server does not set `optimizeDeps.esbuildOptions.target` to match its modern `build.target`, so esbuild may transpile these fields into `__publicField()` helper calls that fail at runtime. For this reason `maplibre-gl` is pinned to `5.16.0`.

This is an upstream issue at the intersection of Strapi, Vite 5, and maplibre-gl v5. It may be resolved by a future release of any of these projects.

**Workaround:** create `src/admin/vite.config.ts` in the Strapi host app:

```typescript
import { mergeConfig, type UserConfig } from 'vite';

export default (config: UserConfig) => {
  return mergeConfig(config, {
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2022',
      },
    },
  });
};
```

## [1.2.0] - 2026-01-29

### Added

- **Localized SearchBox component** - New standalone search component with full internationalization support (en, de, fr, it) [[df821d2](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/df821d2)]
- **Geocoder service module** - Centralized geocoding logic in dedicated `geocoder-service.ts` [[7025954](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/7025954)]

### Changed

- **Geocoder architecture** - Moved search box outside map component to fix form submission conflicts and improve UX [[7025954](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/7025954)]
- **Map attributions system** - Replaced custom credits control with MapLibre's native `AttributionControl` that automatically reads attributions from map style JSON [[ba7a18d](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/ba7a18d)]
- **Default map provider** - Switched from MapLibre demo tiles to OpenFreeMap for more reliable public tile service [[f718470](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/f718470)]
- **SearchBox styling** - Fully adapted to Strapi Design System for consistent UI/UX [[5059b4e](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/5059b4e), [f2bf749](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/f2bf749)]
- **Marker color** - Aligned marker color to match Strapi's primary color palette [[06f47cf](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/06f47cf)]
- **Screenshot** - Updated to reflect new UI with external SearchBox [[ced9092](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/ced9092)]

### Fixed

- **Form submission bug** - Resolved critical issue where search input inside map interfered with Strapi form submission [[7025954](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/7025954)]
- **Translation conventions** - Aligned translations with Strapi v5 plugin standards [[ca4cdeb](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/ca4cdeb)]

### Removed

- **Deprecated geocoder-control.tsx** - Replaced by standalone SearchBox component (257 lines removed) [[7025954](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/7025954)]
- **Custom credits-control.tsx** - Replaced by MapLibre native control (129 lines removed) [[ba7a18d](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/ba7a18d)]
- **Unused dependency** - Removed `@maplibre/maplibre-gl-geocoder` package [[3a352fd](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/3a352fd)]

### Technical Improvements

- Reduced package-lock.json size significantly (cleanup of transitive dependencies)
- Improved test coverage with updated mocks for geocoder refactoring [[6e4aeef](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/commit/6e4aeef)]
- Cleaner component architecture with separation of concerns
- Better TypeScript typing across geocoding services

## [1.1.2] - 2026-01-18

### Documentation

- **Refactored Documentation** in /docs folder to keep README file slim

## [1.1.0] - 2026-01-15

### Added

- **Strapi v5 custom field** for MapLibre-based map selection
- **GeoJSON Feature storage** (RFC 7946 compliant) for location data
- **TypeScript** support with strict typing and comprehensive type definitions
- **Plugin configuration system** with customizable map settings:
  - `mapStyles`: Array of map style configurations with id, name, url, and isDefault flag
  - `defaultZoom`: Initial zoom level (default: 4.5)
  - `defaultCenter`: Initial map center coordinates (default: [0, 0])
  - `geocodingProvider`: Geocoding service (default: 'nominatim')
  - `nominatimUrl`: Custom Nominatim endpoint
  - `poiSources`: Optional custom POI data sources
- **Environment variable support** for API keys with `{VARIABLE_NAME}` syntax
- **Geocoding integration** with Nominatim (OpenStreetMap)
- **Multi-language support** with translations in 5 languages (en, de, es, fr, it)
- **POI layer support** with configurable custom data sources
- **Basemap switcher** for multiple map styles
- **`inputMethod` tracking** to identify how location was created: `"search"`, `"poi_click"`, or `"map_click"`
- `usePluginConfig()` hook for accessing plugin configuration in components
- `LocationFeature` interface and `createLocationFeature()` helper function

### Data Model

Location data is stored as standard GeoJSON Feature:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [9.19, 45.46] },
  "properties": {
    "name": "Location Name",
    "address": "Full address string",
    "source": "nominatim",
    "inputMethod": "search"
  }
}
```

### Configuration Example

```typescript
// config/plugins.ts
export default {
  'maplibre-field': {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: 'streets',
          name: 'Streets',
          url: 'https://api.maptiler.com/maps/streets-v2/style.json?key={MAPTILER_API_KEY}',
          isDefault: true,
        },
      ],
      defaultZoom: 4.5,
      defaultCenter: [9.19, 45.46],
      nominatimUrl: 'https://nominatim.openstreetmap.org',
    },
  },
};
```

### Technical Details

- **Strapi**: v5.0.0+
- **Node.js**: 20.0.0 - 24.x
- **Build**: CJS + ESM for both admin and server
- **Dependencies**: MapLibre GL v5.16.0, React Map GL v8.1.0, PMTiles v4.3.2
