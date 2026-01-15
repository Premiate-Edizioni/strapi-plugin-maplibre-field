# MapLibre Field - Strapi v5 Plugin

[![npm version](https://img.shields.io/npm/v/@premiate/strapi-plugin-maplibre-field)](https://www.npmjs.com/package/@premiate/strapi-plugin-maplibre-field)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Strapi v5](https://img.shields.io/badge/Strapi-v5-blue)](https://strapi.io)

A [Strapi](https://strapi.io/) plugin that provides a [MapLibre](https://www.maplibre.org/) map custom field for your content-types, allowing for mutiple base maps and multiple POI layers configuration, storing GeoJSON Features behind the scene.

![Map Field](https://codeberg.org/Premiate-Edizioni/strapi-plugin-maplibre-field/raw/branch/main/add-or-pin-on-map.png)

## How to Select a Location

There are multiple ways to select a location on the map:

- **Search box**: Type an address or place name to search and select from the results
- **Single click on POI**: Click on any POI marker (from custom GeoJSON layers) to select it
- **Double-click on map**:
  - At high zoom levels, double-clicking near a POI from the base map (e.g., shops, restaurants from OpenStreetMap tiles) will snap to that POI
  - Double-clicking on an empty area will set the marker at the exact coordinates and save longitude and latitude only.

The longitude and latitude of the selected point are displayed in the readonly fields underneath the map. The address is resolved via reverse geocoding from OpenStreetMap/Nominatim.

The field is stored as a [GeoJSON Feature] object (https://datatracker.ietf.org/doc/html/rfc7946#section-3.2) (RFC 7946) in a JSON field:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.195433, 45.464181]
  },
  "properties": {
    "name": "Comando Polizia Locale",
    "address": "Piazza Cesare Beccaria, Duomo, Municipio 1, Milano, 20122, Italia",
    "source": "nominatim",
    "sourceId": "nominatim-12345678",
    "category": "police",
    "inputMethod": "search"
  }
}
```

See [Data Model](#data-model) for details on all properties.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Add a map field](#add-a-map-field-to-your-content-type)
- [Features](#features)
- [POI Selection](#poi-point-of-interest-selection)
- [Data Model](#data-model)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

## Installation

### Requirements

- Strapi v5.0.0 or higher
- Node.js 20.0.0 or higher

### Install

```sh
# Using Yarn
yarn add strapi-plugin-maplibre-field

# Or using NPM
npm install strapi-plugin-maplibre-field
```

## Configuration

### Enable the plugin

Create or update `config/plugins.js` (or `config/plugins.ts` for TypeScript):

```typescript
// config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      // Optional: Customize map settings
      mapStyles: [
        {
          id: "satellite",
          name: "Satellite",
          url: "https://api.maptiler.com/maps/satellite-v4/style.json?key=YOUR_API_KEY",
          isDefault: true,
        },
        {
          id: "osm",
          name: "OpenStreetMap",
          url: "https://api.maptiler.com/maps/openstreetmap/style.json?key=YOUR_API_KEY",
        },
      ],
      defaultZoom: 4.5,
      defaultCenter: [9.19, 45.46], // [longitude, latitude] - Milano, Italy
      geocodingProvider: "nominatim",
      nominatimUrl: "https://nominatim.openstreetmap.org",
    },
  },
};
```

### Configuration Options

| Option              | Type               | Default                                 | Description                                                                                                      |
| ------------------- | ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `mapStyles`         | `MapStyle[]`       | See default config                      | Array of map style configurations. The map will open with the first style or the one marked as `isDefault: true` |
| `defaultZoom`       | `number`           | `4.5`                                   | Initial zoom level (0-20)                                                                                        |
| `defaultCenter`     | `[number, number]` | `[0, 0]`                                | Initial map center [longitude, latitude]                                                                         |
| `geocodingProvider` | `string`           | `'nominatim'`                           | Geocoding service provider                                                                                       |
| `nominatimUrl`      | `string`           | `'https://nominatim.openstreetmap.org'` | Nominatim API endpoint                                                                                           |

#### MapStyle Interface

Each map style in the `mapStyles` array has the following structure:

```typescript
interface MapStyle {
  id: string; // Unique identifier for the style
  name: string; // Display name shown in the basemap switcher
  url: string; // URL to MapLibre style JSON
  isDefault?: boolean; // Set to true for the default style (optional)
}
```

### Map Style Options

The plugin uses **MapLibre GL JS** for rendering, which supports any style that follows the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/).

#### Configuring Map Styles

You can configure multiple map styles that users can switch between. The map will initially open with the first style in the array, or the one marked with `isDefault: true`.

**1. MapLibre Demo Tiles** (Free, public):

```typescript
// In config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "demo",
          name: "Demo",
          url: "https://demotiles.maplibre.org/style.json",
          isDefault: true,
        },
      ],
    },
  },
};
```

**2. MapTiler** (Requires API key):

```typescript
// In Strapi's config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "streets",
          name: "Streets",
          url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${env(
            "MAPTILER_API_KEY"
          )}`,
          isDefault: true,
        },
        {
          id: "outdoor",
          name: "Outdoor",
          url: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${env(
            "MAPTILER_API_KEY"
          )}`,
        },
        {
          id: "satellite",
          name: "Satellite",
          url: `https://api.maptiler.com/maps/satellite-v4/style.json?key=${env(
            "MAPTILER_API_KEY"
          )}`,
        },
      ],
    },
  },
});
```

```bash
# In Strapi's .env file
MAPTILER_API_KEY=your_actual_api_key_here
```

**3. Stadia Maps** (Requires API key):

```typescript
// In Strapi's config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "alidade",
          name: "Alidade Smooth",
          url: `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${env(
            "STADIA_API_KEY"
          )}`,
          isDefault: true,
        },
        {
          id: "osm",
          name: "OSM Bright",
          url: `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${env(
            "STADIA_API_KEY"
          )}`,
        },
      ],
    },
  },
});
```

```bash
# In .env file
STADIA_API_KEY=your_actual_api_key_here
```

**4. Custom Style**:

- Create your own style using [Maputnik](https://maputnik.github.io/) (visual style editor)
- Host the style JSON file on your server or object storage
- Add it to the `mapStyles` array with a unique `id` and descriptive `name`

#### Environment Variables for API Keys

To keep API keys secure and out of version control, use Strapi's built-in `env()` function:

```typescript
// config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "streets",
          name: "Streets",
          url: `https://api.maptiler.com/maps/streets-v4/style.json?key=${env(
            "MAPTILER_API_KEY"
          )}`,
          isDefault: true,
        },
      ],
    },
  },
});
```

```bash
# .env
MAPTILER_API_KEY=your_secret_key_here
```

**Important Notes**:

- Always use template literals (backticks) when interpolating environment variables
- The `env()` function is provided by Strapi and evaluated at server startup
- API keys for map tiles (Maptiler, Stadia, etc.) are safe to expose as they're meant for client-side use with domain restrictions
- For production, ensure all required environment variables are set in your deployment environment

#### Dependencies

The plugin includes these mapping libraries:

- **maplibre-gl** (v5.16.0): Core WebGL-based map rendering engine
- **react-map-gl** (v8.1.0): React wrapper for MapLibre GL with components
- **pmtiles** (v4.3.2): Support for cloud-native PMTiles format (efficient tile hosting without a server)
- **@maplibre/maplibre-gl-geocoder** (v1.9.4): Geocoding control for the map

### Geocoding Configuration

The plugin uses **Nominatim** by default for geocoding (converting addresses to coordinates and vice versa).

#### Using Public Nominatim (Default)

```typescript
geocodingProvider: 'nominatim',
nominatimUrl: 'https://nominatim.openstreetmap.org',
```

**Important**: Public Nominatim has usage limits. Please review their [Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).

#### Using Self-Hosted Nominatim

For production use with high traffic, consider hosting your own Nominatim instance:

```typescript
nominatimUrl: 'https://your-nominatim-server.org',
```

#### Alternative Geocoding Providers

Currently, the plugin is optimized for Nominatim. Support for other providers (MapTiler, Google, etc.) can be added by extending the geocoder component.

### Update security middleware

For the map to display properly, update the `strapi::security` middleware configuration.

Open `config/middlewares.ts` (or `.js`) and add `'worker-src': ['blob:']` to the CSP directives:

```typescript
// config/middlewares.ts
export default [
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:"],
          "media-src": ["'self'", "data:", "blob:"],
          "worker-src": ["blob:"], // Required for MapLibre workers
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  "strapi::cors",
  "strapi::poweredBy",
  "strapi::logger",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
```

## Add a map field to your content type

In the Strapi content type builder:

- Click on `Add another field`
- Select the `Custom` tab
- Select the `Map` field
- Type a name for the field
- Click `Finish`

![Add map field to content type](https://codeberg.org/Premiate-Edizioni/strapi-plugin-maplibre-field/raw/branch/main/add-maplibre-custom-field.png)

### Localization (i18n)

By default, **localization is disabled** for map fields because geographic coordinates are universal and typically don't vary by language.

However, if you need different locations per language (e.g., different office addresses in different countries), you can enable localization in the **Advanced Settings** tab when adding the field:

1. In the Content-Type Builder, click on the **Advanced Settings** tab
2. Check "Enable localization for this field"

> **Note**: This setting is disabled by default as coordinates are typically the same across all languages.

## Features

### Interactive Map

- **MapLibre GL** powered interactive map with smooth zoom and pan
- **OpenStreetMap** tiles via Protomaps/PMTiles
- Fully customizable map style via configuration

### Geocoding

- **Forward geocoding**: Search for places using the search box
- **Reverse geocoding**: Double-click anywhere on the map to find the nearest address
- Powered by **Nominatim** (OpenStreetMap's geocoding service)
- Real-time notifications for geocoding success, errors, and warnings

### Multi-language Support

Built-in translations for:

- English
- German (Deutsch)
- French (Français)
- Italian (Italiano)
- Spanish (Español)

### User Experience

- **Visual feedback**: Toast notifications for all user actions
  - Success messages when addresses are found
  - Warnings when no results are available
  - Error messages with actionable guidance

### Developer Experience

- **TypeScript** support
- **Configurable**: All map settings can be customized
- **Type-safe**: Proper interfaces for all API responses
- **Well-tested**: Comprehensive test coverage

## POI (Point of Interest) Selection

The plugin supports direct POI selection with visual markers on the map, allowing users to select pre-defined locations or save coordinates.

### POI Features

- **POI Markers Always Visible** - Shows available POIs on the map when zoomed in (customizable zoom level)
- **Direct Click Selection** - Click on any POI marker to select and save complete POI data
- **Coordinates-Only Mode** - Double-click anywhere on empty map area to save only coordinates (no name/address)
- **Custom API Support** - Integrate your own GeoJSON API alongside Nominatim
- **Enhanced Search** - Search field queries both Nominatim AND custom API, merging results with custom API priority
- **Visual Distinction** - Different marker colors configurable for custom POIs
- **Performance Optimized** - Zoom-based visibility and display limits prevent overcrowding

### POI Configuration

Add POI configuration to your plugin settings:

```typescript
// config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      // Basic configuration
      mapStyles: [
        {
          id: "satellite",
          name: "Satellite",
          url: "https://api.maptiler.com/maps/satellite-v4/style.json?key=YOUR_API_KEY",
          isDefault: true,
        },
      ],
      nominatimUrl: "https://nominatim.openstreetmap.org",
      defaultCenter: [9.19, 45.46],
      defaultZoom: 13,

      // POI Configuration
      poiDisplayEnabled: true, // Enable POI markers display
      poiMinZoom: 10, // Show POIs only when zoomed in >= this level
      poiMaxDisplay: 100, // Maximum number of POIs to display
      poiSearchEnabled: true, // Include custom API results in search
      poiSnapRadius: 5, // Snap radius in meters for double-click POI detection (default: 5m)
      poiSources: [
        // Working examples using static GeoJSON files (hosted with CORS enabled)
        {
          id: "skatespots",
          name: "My Skatespots",
          apiUrl:
            "https://fotta-maps.it-mil-1.linodeobjects.com/samples/skatespots.geojson",
          enabled: true,
        },
        {
          id: "skateshops",
          name: "My Skateshops",
          apiUrl:
            "https://fotta-maps.it-mil-1.linodeobjects.com/samples/skateshops.geojson",
          enabled: false,
        },
      ],
    },
  },
};
```

### POI Configuration Options

| Option              | Type          | Default | Description                                                             |
| ------------------- | ------------- | ------- | ----------------------------------------------------------------------- |
| `poiDisplayEnabled` | `boolean`     | `true`  | Display POI markers on map                                              |
| `poiMinZoom`        | `number`      | `10`    | Minimum zoom level to show POI markers (prevents overcrowding)          |
| `poiMaxDisplay`     | `number`      | `100`   | Maximum number of POIs displayed (closest to map center)                |
| `poiSearchEnabled`  | `boolean`     | `true`  | Include custom API results in search field                              |
| `poiSnapRadius`     | `number`      | `5`     | Snap radius in meters for double-click POI detection                    |
| `poiSources`        | `POISource[]` | `[]`    | Array of POI sources with layer control (see POISource interface below) |

#### POISource Interface

```typescript
interface POISource {
  id: string; // Unique identifier for the layer
  name: string; // Display name in layer control
  apiUrl: string; // GeoJSON API endpoint URL
  enabled?: boolean; // Initial layer visibility (default: true)
}
```

**Notes:**

- `id`: Must be unique across all POI sources. Used internally to track layer state.
- `name`: Displayed in the layer control panel. Should be descriptive and concise.
- `apiUrl`: Must return a valid GeoJSON FeatureCollection (see Custom POI API section below).
- `enabled`: Controls initial visibility. Users can toggle layers on/off using the layer control panel regardless of this setting.

### Layer Control

When multiple POI sources are configured, a **layer control panel** appears on the map allowing you to:

- **Toggle individual layers on/off**: Click the eye icon to show/hide POI markers from each source
- **Real-time updates**: POIs are automatically loaded/removed when toggling layers
- **Dynamic map movement**: When you move the map to a new area, POIs from enabled layers are automatically fetched for the new viewport
- **Independent sources**: Each POI source can be controlled separately

The layer control is automatically displayed when you configure multiple `poiSources` in your plugin configuration.

### User Interaction

**Click on POI marker** → Selects that POI and saves complete data:

- POI name
- POI type
- Full address
- Coordinates
- Custom metadata
- Source indicator (Nominatim or custom)

**Double-click anywhere** → Intelligent POI detection with snap radius:

- **If POI found within snap radius** (default: 5m):
  - Automatically selects the nearest POI
  - Saves complete POI data (name, type, address, coordinates, metadata)
  - Shows distance in notification (e.g., "Skatepark Milano (3m)")
- **If no POI found within snap radius**:
  - Saves only coordinates (no name or address)
  - Useful for marking exact locations without POI data
- **Configurable**: Adjust `poiSnapRadius` to change detection sensitivity (in meters)

**Search field** → Queries both sources:

- Nominatim results: Address Name
- Custom API results: POI Name
- Both displayed in dropdown

### Custom POI API

The plugin supports custom GeoJSON FeatureCollection APIs for POI data.

#### Example: Fotta Skateparks API

```
GET https://your-api-server.org/endpoint
```

#### Response Format (GeoJSON FeatureCollection)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "019ac1b6-5823-7808-9be6-62733b3d0a0a",
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [11.1448496, 46.052144]
      },
      "properties": {
        "name": "Skatepark Villa",
        "sport": "skateboard",
        "leisure": "pitch",
        "osm_id": "node/12345",
        "surface": "concrete"
      }
    }
  ]
}
```

#### Requirements

- **Format**: Must return GeoJSON FeatureCollection with Point features
- **Authentication**: Must be publicly accessible (no authentication)
- **Coordinates**: Must use `geometry.coordinates` as `[longitude, latitude]`
- **Name**: Must include `properties.name` (can be `null`, will use fallback)
- **Structure**: Compatible with standard GeoJSON specification

#### How It Works

1. **Search Field**:

   - Plugin queries full dataset from API
   - Filters results client-side by name matching search query
   - Merges with Nominatim results (both shown in dropdown)

2. **POI Display**:

   - Query POIs based on map viewport and zoom level
   - Display up to `poiMaxDisplay` closest POIs to map center
   - Only show when `zoom >= poiMinZoom`
   - Update markers when map moves/zooms

3. **POI Selection** (click on marker):

   - Save complete POI data: name, type, address, coordinates, metadata, source
   - Visual feedback with orange highlight on selected marker
   - Success notification shows POI name and source

4. **Performance**:
   - API response is cached client-side (15 minutes)
   - Filtering by name/viewport happens in browser
   - Works well with datasets up to ~5000 features

## Data Model

The field stores location data as a **standard GeoJSON Feature** ([RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946)). Properties are only included when available (no null or empty values).

### GeoJSON Feature Structure

```typescript
interface LocationFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    name?: string; // POI name or short location name
    address?: string; // Full formatted address
    source?: string; // "nominatim" or custom source ID (e.g., "fotta-skatespots")
    sourceId?: string; // Original ID from the source
    sourceLayer?: string; // Display name of the source (e.g., "Fotta Skatespots")
    category?: string; // POI type/category (e.g., "skating_spot", "bus_stop")
    inputMethod?: string; // How it was created: "search" | "poi_click" | "map_click"
    metadata?: object; // Original metadata from the source
  };
}
```

### Example: Nominatim Search Result

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.1901019, 45.460068]
  },
  "properties": {
    "name": "Piazza Velasca",
    "address": "Piazza Velasca, Cerchia dei Navigli, Municipio 1, Milano, Lombardia, 20122, Italia",
    "source": "nominatim",
    "sourceId": "nominatim-68428992",
    "category": "bus_stop",
    "inputMethod": "search",
    "metadata": {
      "osm_id": 4843517235,
      "osm_type": "node",
      "place_id": 68428992,
      "addresstype": "highway"
    }
  }
}
```

### Example: POI Click (Custom Source)

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.196492, 45.480958]
  },
  "properties": {
    "name": "Ledge Milano District",
    "address": "Via Roma 1, 20121 Milano MI, Italy",
    "source": "fotta-skatespots",
    "sourceId": "019ac1b6-5823-7808-9be6-62733b3d0a0a",
    "sourceLayer": "Fotta Skatespots",
    "category": "skating_spot",
    "inputMethod": "poi_click",
    "metadata": {
      "sport": "skateboard",
      "surface": "concrete"
    }
  }
}
```

### Example: Double-Click on Empty Area

When double-clicking on an empty area (no POI within snap radius), only coordinates and input method are saved:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.190252, 45.459891]
  },
  "properties": {
    "inputMethod": "map_click"
  }
}
```

### Properties Reference

| Property      | Type     | Description                                                             |
| ------------- | -------- | ----------------------------------------------------------------------- |
| `name`        | `string` | POI name or short location name                                         |
| `address`     | `string` | Full formatted address (from Nominatim or reverse geocoding)            |
| `source`      | `string` | Data source: `"nominatim"` or custom source ID                          |
| `sourceId`    | `string` | Original identifier from the source                                     |
| `sourceLayer` | `string` | Human-readable name of the source layer                                 |
| `category`    | `string` | POI type/category (e.g., `"skating_spot"`, `"bus_stop"`)                |
| `inputMethod` | `string` | How the location was selected: `"search"`, `"poi_click"`, `"map_click"` |
| `metadata`    | `object` | Additional metadata from the source (varies by source)                  |

**Note**: All properties are optional and only included when available. Empty strings and null values are automatically omitted.

### Performance & Visual Design

**Zoom-based Visibility**:

- POIs hidden when zoomed out (< `poiMinZoom`)
- Prevents map clutter at country/continent view
- Markers appear when zooming into city/neighborhood level

**Display Limit**:

- Maximum `poiMaxDisplay` POIs shown (default: 100)
- Sorted by distance from map center
- Only closest/most relevant POIs displayed

**Visual Distinction**:

- Custom POIs: Configurable colors
- Selected POI: Orange marker (#ff5200 - Strapi orange)
- Labels show POI names on hover

**Viewport-based Loading**:

- POIs query based on current map bounds
- Updates automatically when panning or zooming
- Debounced for smooth performance

### Development

The plugin uses:

- **Build system**: `@strapi/sdk-plugin` for TypeScript compilation
- **Package manager**: npm
- **Testing**: Jest for unit tests
- **Type checking**: TypeScript strict mode

Build the plugin:

```bash
npm run build
```

Watch mode for development:

```bash
npm run watch
```

## Contributing

Bug reports and pull requests are welcome on [Codeberg](https://codeberg.org/premiate-edizioni/strapi-plugin-maplibre-field).

## Credits

This plugin was forked from the [Strapi plugin map-field](https://github.com/play14team/strapi-plugin-map-field) by Cédric Pontet and moves from Mapbox to MapLibre with foundations on OpenStreetMap, Nominatim geocoding and Protomaps.

Thanks [Enzo Brunii](https://github.com/enzobrunii/strapi-plugin-map-field/commits?author=enzobrunii) for initial hints.

## License

[MIT](LICENSE) © Claudio Bernardini / Dipartimento di Cartografia Esistenzialista in Fotta, Premiate Edizioni
