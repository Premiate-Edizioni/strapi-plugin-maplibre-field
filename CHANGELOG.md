# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
