# MapLibre Field - Strapi v5 Plugin

[![npm version](https://img.shields.io/npm/v/@premiate/strapi-plugin-maplibre-field)](https://www.npmjs.com/package/@premiate/strapi-plugin-maplibre-field)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/LICENSE)
[![Strapi v5](https://img.shields.io/badge/Strapi-v5-blue)](https://strapi.io)

A [Strapi](https://strapi.io/) plugin providing a [MapLibre](https://www.maplibre.org/) map custom field with POI support, geocoding and multi base maps.

![Map Field](https://raw.githubusercontent.com/Premiate-Edizioni/strapi-plugin-maplibre-field/main/add-or-pin-on-map.png)

## ✨ Key Features

- **Works with no configuration** - falls back to OpenFreeMap tiles; no API key, no account
- **Interactive MapLibre GL map** with fullscreen, zoom, compass and geolocate controls
- **Four ways to place a point** - search, POI click, double-click, or drag the marker
- **Multiple basemap styles** support (MapTiler, Stadia, PMTiles, custom)
- **OpenStreetMap geocoding** via Nominatim, in the language of the admin panel
- **Keyboard-accessible search** built on Strapi's Combobox (WAI-ARIA combobox pattern)
- **Custom POI layers** with GeoJSON API or PMTiles vector tiles
- **Layer control panel** for toggling POI sources
- **GeoJSON Feature** storage (RFC 7946 compliant)
- **Five UI languages** - English, German, Spanish, French, Italian
- **TypeScript** support with full type definitions

## 📦 Installation

### Requirements

- Strapi v5.0.0 or higher
- Node.js 22.0.0 or higher

### Install

```bash
# Using npm
npm install @premiate/strapi-plugin-maplibre-field

# Using Yarn
yarn add @premiate/strapi-plugin-maplibre-field
```

## ⚙️ Quick Strapi Setup

### 1. Enable the plugin

Create or update `config/plugins.ts`:

```typescript
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "ofm",
          name: "OpenFreeMap",
          url: "https://tiles.openfreemap.org/styles/liberty",
          isDefault: true,
        },
      ],
      defaultCenter: [9.19, 45.46], // [longitude, latitude]
      defaultZoom: 13,
    },
  },
};
```

### 2. Update security middleware

Open `config/middlewares.ts` and add `'worker-src': ["'self'", 'blob:']`:

```typescript
export default [
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "img-src": ["'self'", "data:", "blob:"],
          // MapLibre parses tiles in a Web Worker. `'self'` is the part that matters: the
          // plugin serves that worker from your own Strapi instance.
          "worker-src": ["'self'", "blob:"],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  // ... other middlewares
];
```

### 3. Add map field to content type

In the Strapi Content-Type Builder pick up your Collection Type, Single Type or Component and:

1. Click **Add another field**
2. Select the **Custom** tab
3. Select the **Map** field
4. Type a name for the field
5. Click **Finish**

![Add map field](https://raw.githubusercontent.com/Premiate-Edizioni/strapi-plugin-maplibre-field/main/add-maplibre-custom-field.png)

## 🎯 How to Select a Location

There are four ways to select a location:

- **Search box** - Type an address or place name, then press **Enter**
- **Click POI marker** - Select pre-defined points of interest
- **Double-click map** - Place marker at exact coordinates
- **Drag the marker** - Reposition an existing point directly on the map

The selected location is saved as a GeoJSON Feature with coordinates, name, address, and metadata.

## 📚 Documentation

- **[Configuration Guide](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/CONFIGURATION.md)** - Map styles, geocoding, POI setup, all options
- **[Usage Guide](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/USAGE.md)** - Adding fields, selecting locations, localization
- **[POI Integration](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/POI.md)** - Custom POI sources, layer control, GeoJSON API
- **[Data Model](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/DATA-MODEL.md)** - GeoJSON structure, properties reference

## 🗺️ Map Providers

The plugin supports any [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/) compatible provider:

- **OpenFreeMap** - Free, public OpenStreetMap tiles, no API key required (setup as fallback if no configuration available)
- **MapTiler** - Requires API key, multiple styles available
- **Stadia Maps** - Requires API key, OSM-based styles
- **PMTiles** - Self-hosted tiles, no tile server required
- **Custom styles** - Create your own with [Maputnik](https://maputnik.github.io/)

See the [Configuration Guide](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/CONFIGURATION.md) for detailed setup instructions.

## 🏢 POI Support

Integrate custom Points of Interest from a GeoJSON URL (static file or API) or a PMTiles vector tile archive:

- Display POI markers on the map
- Click to select and save complete POI data
- Layer control to toggle multiple POI sources
- Search integration (queries both Nominatim and custom APIs)
- Configurable zoom levels and display limits

See the [POI Integration Guide](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/POI.md) for setup and examples.

## 🔧 Data Structure

Locations are stored as GeoJSON Features:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.1877, 45.4596]
  },
  "properties": {
    "name": "Torre Velasca",
    "address": "Piazza Velasca 5, 20122 Milano, Lombardia, Italia",
    "source": "nominatim",
    "inputMethod": "search"
  }
}
```

See the [Data Model Guide](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/docs/DATA-MODEL.md) for complete property reference.

## 🤝 Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field).

See [CONTRIBUTING.md](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/CONTRIBUTING.md) for development setup and guidelines.

## 📝 Credits

This plugin was forked from [strapi-plugin-map-field](https://github.com/play14team/strapi-plugin-map-field) by Cédric Pontet and migrated from Mapbox to MapLibre with foundations on OpenStreetMap, Nominatim geocoding, and Protomaps.

Thanks to [Enzo Brunii](https://github.com/enzobrunii) for initial contributions.

## 📄 License

[MIT](https://github.com/Premiate-Edizioni/strapi-plugin-maplibre-field/blob/main/LICENSE) © Claudio Bernardini / Dipartimento di Cartografia Esistenzialista in Fotta, Premiate Edizioni
