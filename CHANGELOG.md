# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-02-22

### Fixed

- **Vite/esbuild class field transpilation** - Removed ES2022 class field declarations from `BasemapControl` and `LayerControlImpl` to prevent `__publicField is not defined` runtime error when Strapi's Vite pre-bundles the plugin with esbuild targeting below ES2022
- **Prettier formatting** - Fixed line length violation in config schema
- **Admin route security** - Protected `/config` endpoint with `policies: ['admin::isAuthenticatedAdmin']` to prevent unauthorized access

### Changed

- **Node.js support** - Extended compatibility to Node.js 24.x (>=20.0.0 <=24.x.x)
- **TypeScript** - Updated from ^5.0.0 to ^5.5.0
- **ESLint** - Updated from ^8.0.0 to ^8.57.0
- **MapLibre GL** - Updated from v5.16.0 to v5.18.0
- **PMTiles** - Updated from v4.3.2 to v4.4.0
- **Native Marker click events** - Main location marker now supports click events (MapLibre v5.18.0+ feature), showing coordinate feedback via Strapi notification
- **FullscreenControl** - Added `useFullscreenPseudo` config option for CSS-based fullscreen (faster on some devices, requires MapLibre v5.18.0+)

### Known issue: `__publicField is not defined` in Strapi dev mode

`maplibre-gl` v5 uses ES2022 class field declarations internally (e.g., in the MLT codec). Strapi's Vite dev server does not set `optimizeDeps.esbuildOptions.target` to match its modern `build.target`, so esbuild may transpile these fields into `__publicField()` helper calls that fail at runtime.

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
